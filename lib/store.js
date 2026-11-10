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

let store;
function getStore() {
  if (!store) store = process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : localStore();
  return store;
}

module.exports = { getStore };
