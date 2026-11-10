// 저장소: 내 컴퓨터에서는 data/ 폴더, Vercel에서는 Vercel Blob(비공개)
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function localStore() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return {
    kind: 'local',
    async readJson(name, fallback) {
      try {
        return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
      } catch {
        return fallback;
      }
    },
    async writeJson(name, data) {
      const file = path.join(DATA_DIR, name);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(`${file}.tmp`, file);
    },
    async putPhoto(name, buffer) {
      fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
    },
    async getPhoto(name) {
      const file = path.join(UPLOAD_DIR, name);
      try {
        const st = fs.statSync(file);
        return { stream: fs.createReadStream(file), size: st.size };
      } catch {
        return null;
      }
    },
    async deletePhoto(name) {
      fs.rmSync(path.join(UPLOAD_DIR, name), { force: true });
    },
  };
}

function blobStore() {
  const { put, get, del } = require('@vercel/blob');
  const opts = { access: 'private' };
  return {
    kind: 'blob',
    async readJson(name, fallback) {
      const r = await get(`data/${name}`, { ...opts, useCache: false });
      if (!r || !r.stream) return fallback;
      return JSON.parse(await new Response(r.stream).text());
    },
    async writeJson(name, data) {
      await put(`data/${name}`, JSON.stringify(data), {
        ...opts,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
      });
    },
    async putPhoto(name, buffer, contentType) {
      await put(`photos/${name}`, buffer, { ...opts, addRandomSuffix: false, contentType });
    },
    async getPhoto(name) {
      const r = await get(`photos/${name}`, opts);
      if (!r || !r.stream) return null;
      return { stream: Readable.fromWeb(r.stream), size: r.blob.size, contentType: r.blob.contentType };
    },
    async deletePhoto(name) {
      await del(`photos/${name}`).catch(() => {});
    },
  };
}

// Supabase Storage (비공개 버킷). 패키지 없이 REST API로 써요.
function supabaseStore() {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || 'yujin-diary';
  const auth = { apikey: key, Authorization: `Bearer ${key}` };
  const objectPath = (p) => p.split('/').map(encodeURIComponent).join('/');
  let bucketReady;

  function ensureBucket() {
    if (!bucketReady) {
      bucketReady = fetch(`${base}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: false }),
      }).then(async (r) => {
        const text = await r.text();
        // 이미 있으면 괜찮아요
        if (!r.ok && !/already exists|Duplicate/i.test(text)) {
          bucketReady = null;
          throw new Error(`Supabase 버킷을 만들 수 없어요 (${r.status}): ${text}`);
        }
      });
    }
    return bucketReady;
  }

  async function upload(p, body, contentType) {
    await ensureBucket();
    const r = await fetch(`${base}/storage/v1/object/${bucket}/${objectPath(p)}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': contentType, 'x-upsert': 'true', 'Cache-Control': 'no-cache' },
      body,
    });
    if (!r.ok) throw new Error(`Supabase 저장 실패 (${r.status}): ${await r.text()}`);
  }

  async function download(p) {
    await ensureBucket();
    const r = await fetch(`${base}/storage/v1/object/authenticated/${bucket}/${objectPath(p)}`, {
      headers: auth,
      cache: 'no-store',
    });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error(`Supabase 읽기 실패 (${r.status}): ${await r.text()}`);
    return r;
  }

  return {
    kind: 'supabase',
    async readJson(name, fallback) {
      const r = await download(`data/${name}`);
      return r ? JSON.parse(await r.text()) : fallback;
    },
    async writeJson(name, data) {
      await upload(`data/${name}`, JSON.stringify(data), 'application/json');
    },
    async putPhoto(name, buffer, contentType) {
      await upload(`photos/${name}`, buffer, contentType);
    },
    async getPhoto(name) {
      const r = await download(`photos/${name}`);
      if (!r || !r.body) return null;
      const size = Number(r.headers.get('content-length')) || undefined;
      return { stream: Readable.fromWeb(r.body), size, contentType: r.headers.get('content-type') };
    },
    async deletePhoto(name) {
      await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [`photos/${name}`] }),
      }).catch(() => {});
    },
  };
}

// 우선순위: Supabase → Vercel Blob → 내 컴퓨터 data/ 폴더
let store;
function getStore() {
  if (!store) {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) store = supabaseStore();
    else if (process.env.BLOB_READ_WRITE_TOKEN) store = blobStore();
    else store = localStore();
  }
  return store;
}

module.exports = { getStore };
