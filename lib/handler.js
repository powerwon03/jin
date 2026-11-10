// API (/api/*) 와 사진 (/uploads/*) 처리. 내 컴퓨터와 Vercel에서 같이 써요.
const crypto = require('node:crypto');
const { getConfig } = require('./config');
const { getStore } = require('./store');

const MAX_BODY = 4 * 1024 * 1024; // Vercel 요청 한도(4.5MB) 안쪽
const MAX_PHOTOS = 4;
const MAX_TEXT = 5000;
const SESSION_DAYS = 30;
const MOODS = ['😆', '🥰', '🥹', '😴', '😢', '🤯'];
const MAX_FAILS = 5;
const LOCK_MS = 5 * 60 * 1000;
const PHOTO_NAME = /^\d+-[a-f0-9]{12}\.(jpg|png|webp|gif)$/;
const PHOTO_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const loginFails = new Map(); // userId → { count, until }

const users = () => getConfig().users;
const findUser = (id) => users().find((u) => u.id === id);

/* ---------- 세션 (서명된 쿠키) ---------- */
function sign(value) {
  return crypto.createHmac('sha256', getConfig().secret).update(value).digest('base64url');
}
function makeToken(userId) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function readSession(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return null;
  const [userId, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!userId || !exp || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${userId}.${exp}`));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return findUser(userId) || null;
}
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function cookie(req, value, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

/* ---------- HTTP 도우미 ---------- */
function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function readJson(req) {
  // Vercel은 body를 미리 읽어둬요
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    if (Buffer.isBuffer(req.body)) return Promise.resolve(JSON.parse(req.body.toString('utf8') || '{}'));
    return Promise.resolve(req.body || {});
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, '사진이 너무 커요.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(httpError(400, '요청 형식이 올바르지 않아요.'));
      }
    });
    req.on('error', reject);
  });
}

function publicEntry(e) {
  const author = findUser(e.authorId);
  return { ...e, authorName: author ? author.name : '알 수 없음' };
}

async function savePhotoData(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw httpError(400, '사진 형식은 JPG, PNG, WEBP, GIF만 돼요.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await getStore().putPhoto(name, Buffer.from(m[2], 'base64'), PHOTO_TYPES[ext]);
  return name;
}

/* ---------- 라우팅 ---------- */
async function handleApi(req, res, pathname) {
  const p = pathname;
  const store = getStore();

  if (p === '/api/people' && req.method === 'GET') {
    return json(res, 200, { people: users().map(({ id, name }) => ({ id, name })) });
  }

  if (p === '/api/login' && req.method === 'POST') {
    const { userId, password } = await readJson(req);
    const user = findUser(userId);
    if (!user) return json(res, 401, { error: '누구인지 먼저 골라줘.' });

    // 4자리 번호라서 틀린 횟수를 제한해요 (5번 틀리면 5분 잠금)
    const lock = loginFails.get(user.id) || { count: 0, until: 0 };
    if (lock.until > Date.now()) {
      const min = Math.ceil((lock.until - Date.now()) / 60000);
      return json(res, 429, { error: `너무 많이 틀렸어요. ${min}분 뒤에 다시 해줘.` });
    }
    if (!safeEqual(password || '', user.password)) {
      lock.count += 1;
      if (lock.count >= MAX_FAILS) Object.assign(lock, { count: 0, until: Date.now() + LOCK_MS });
      loginFails.set(user.id, lock);
      return json(res, 401, { error: '번호가 맞지 않아요. 전화번호 뒷자리 4개를 다시 눌러줘.' });
    }
    loginFails.delete(user.id);
    const value = encodeURIComponent(makeToken(user.id));
    return json(res, 200, { me: { id: user.id, name: user.name } }, { 'Set-Cookie': cookie(req, value, SESSION_DAYS * 86400) });
  }

  if (p === '/api/logout' && req.method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  }

  // 여기부터는 로그인한 두 사람만
  const me = readSession(req);
  if (!me) return json(res, 401, { error: '로그인이 필요해요.' });

  if (p.startsWith('/uploads/')) {
    const name = decodeURIComponent(p.slice('/uploads/'.length));
    if (!PHOTO_NAME.test(name)) return json(res, 404, { error: '사진이 없어요.' });
    const photo = await store.getPhoto(name);
    if (!photo) return json(res, 404, { error: '사진이 없어요.' });
    const headers = {
      'Content-Type': photo.contentType || PHOTO_TYPES[name.split('.').pop()],
      'Cache-Control': 'private, max-age=31536000, immutable',
    };
    if (photo.size) headers['Content-Length'] = photo.size;
    res.writeHead(200, headers);
    photo.stream.pipe(res);
    return;
  }

  if (p === '/api/me' && req.method === 'GET') {
    return json(res, 200, { me: { id: me.id, name: me.name } });
  }

  if (p === '/api/entries' && req.method === 'GET') {
    const diary = await store.readJson('diary.json', { entries: [] });
    const entries = [...diary.entries].sort((a, b) => b.createdAt - a.createdAt).map(publicEntry);
    return json(res, 200, { entries });
  }

  // 사진은 한 장씩 먼저 올리고, 일기에는 사진 이름만 붙여요
  if (p === '/api/photos' && req.method === 'POST') {
    const { dataUrl } = await readJson(req);
    return json(res, 201, { name: await savePhotoData(dataUrl) });
  }

  if (p === '/api/entries' && req.method === 'POST') {
    const body = await readJson(req);
    const text = String(body.text || '').trim();
    const photos = Array.isArray(body.photos) ? body.photos : [];
    if (!text && photos.length === 0) return json(res, 400, { error: '글이나 사진 중 하나는 있어야 해요.' });
    if (text.length > MAX_TEXT) return json(res, 400, { error: `글은 ${MAX_TEXT}자까지 쓸 수 있어요.` });
    if (photos.length > MAX_PHOTOS) return json(res, 400, { error: `사진은 한 번에 ${MAX_PHOTOS}장까지 올릴 수 있어요.` });
    const names = [];
    for (const ph of photos) {
      if (typeof ph === 'string' && PHOTO_NAME.test(ph)) names.push(ph);
      else names.push(await savePhotoData(ph));
    }
    const entry = {
      id: crypto.randomUUID(),
      authorId: me.id,
      text,
      mood: MOODS.includes(body.mood) ? body.mood : null,
      photos: names,
      createdAt: Date.now(),
    };
    const diary = await store.readJson('diary.json', { entries: [] });
    diary.entries.push(entry);
    await store.writeJson('diary.json', diary);
    return json(res, 201, { entry: publicEntry(entry) });
  }

  const del = /^\/api\/entries\/([\w-]+)$/.exec(p);
  if (del && req.method === 'DELETE') {
    const diary = await store.readJson('diary.json', { entries: [] });
    const entry = diary.entries.find((e) => e.id === del[1]);
    if (!entry) return json(res, 404, { error: '이미 지워진 일기예요.' });
    if (entry.authorId !== me.id) return json(res, 403, { error: '내가 쓴 일기만 지울 수 있어요.' });
    diary.entries = diary.entries.filter((e) => e.id !== entry.id);
    await store.writeJson('diary.json', diary);
    await Promise.all(entry.photos.map((f) => store.deletePhoto(f)));
    return json(res, 200, { ok: true });
  }

  // 지원이 줘패기 게임 점수
  if (p === '/api/scores' && req.method === 'GET') {
    return json(res, 200, await store.readJson('scores.json', { best: {} }));
  }
  if (p === '/api/scores' && req.method === 'POST') {
    const { score } = await readJson(req);
    if (!Number.isInteger(score) || score < 0 || score > 100000) return json(res, 400, { error: '점수가 이상해요.' });
    const scores = await store.readJson('scores.json', { best: {} });
    const isBest = score > (scores.best[me.id]?.score ?? -1);
    if (isBest) {
      scores.best[me.id] = { score, at: Date.now() };
      await store.writeJson('scores.json', scores);
    }
    return json(res, 200, { ...scores, isBest });
  }

  return json(res, 404, { error: '없는 주소예요.' });
}

async function handle(req, res, pathname) {
  try {
    await handleApi(req, res, pathname);
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) json(res, err.status || 500, { error: err.status ? err.message : '서버에서 문제가 생겼어요.' });
  }
}

module.exports = { handle };
