'use strict';

/* ================= 아이폰(Apple) 이모지 ================= */
// 어떤 기기에서 열어도 아이폰 이모지로 보이도록 Apple 이모지 이미지를 사용해요.
const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
const EMOJI_RE = /\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}\p{Emoji_Modifier}?️?(?:‍\p{Extended_Pictographic}\p{Emoji_Modifier}?️?)*/gu;

function emojiCandidates(str) {
  const full = Array.from(str).map((c) => c.codePointAt(0).toString(16)).join('-');
  const noVs = full.split('-').filter((c) => c !== 'fe0f').join('-');
  const set = new Set([full, noVs, `${noVs}-fe0f`]);
  return [...set].map((c) => `${EMOJI_CDN}${c}.png`);
}

function emojiImg(str) {
  const img = document.createElement('img');
  const urls = emojiCandidates(str);
  let i = 0;
  img.className = 'emoji';
  img.alt = str;
  img.draggable = false;
  img.decoding = 'async';
  img.src = urls[0];
  img.onerror = () => {
    i += 1;
    if (i < urls.length) img.src = urls[i];
    else img.replaceWith(document.createTextNode(str)); // 이미지를 못 불러오면 기본 이모지로
  };
  return img;
}

// 텍스트를 넣으면서 이모지만 아이폰 이모지 이미지로 바꿔요 (HTML 주입 없음)
function fillWithEmoji(el, text) {
  el.textContent = '';
  let last = 0;
  for (const m of text.matchAll(EMOJI_RE)) {
    if (m.index > last) el.append(text.slice(last, m.index));
    el.append(emojiImg(m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) el.append(text.slice(last));
}

/* ================= 도우미 ================= */
const $ = (sel) => document.querySelector(sel);
const BIRTH = { y: 2003, m: 11, d: 9 };
const MOODS = ['😆', '🥰', '🥹', '😴', '😢', '🤯'];
const MAX_PHOTOS = 4;

let me = null;
let people = [];
let pendingPhotos = []; // { dataUrl }
let selectedMood = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '문제가 생겼어요. 다시 시도해줘.'), { status: res.status });
  return data;
}

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  // 하단 탭바: 일기장/게임 화면에서만
  const tabbar = $('#tabbar');
  tabbar.hidden = !(id === 'screen-diary' || id === 'screen-game');
  document.body.classList.toggle('has-tabbar', !tabbar.hidden);
  for (const b of tabbar.querySelectorAll('[data-go]')) {
    const on = (b.dataset.go === 'diary' && id === 'screen-diary') || (b.dataset.go === 'game' && id === 'screen-game');
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

for (const el of document.querySelectorAll('.tabbar [data-emoji]')) fillWithEmoji(el, el.dataset.emoji);
$('#tabbar').addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  if (go !== 'game' && typeof stopGame === 'function') stopGame();
  if (go === 'diary') enterDiary();
  if (go === 'game') $('#open-game').click();
  if (go === 'bday') $('#show-bday').click();
  if (go === 'logout') $('#logout').click();
});

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  fillWithEmoji(t, msg);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================= 1. 생일 화면 ================= */
function setupBirthday() {
  const now = new Date();
  const passed = now.getMonth() + 1 > BIRTH.m || (now.getMonth() + 1 === BIRTH.m && now.getDate() >= BIRTH.d);
  const nth = now.getFullYear() - BIRTH.y - (passed ? 0 : 1);
  const isToday = now.getMonth() + 1 === BIRTH.m && now.getDate() === BIRTH.d;
  $('#bday-sub').textContent = isToday
    ? `오늘은 유진이의 ${nth}번째 생일`
    : `유진이의 ${nth}번째 생일`;

  const deco = document.querySelector('[data-emoji]');
  fillWithEmoji(deco, deco.dataset.emoji);
  document.querySelectorAll('.emojify').forEach((el) => fillWithEmoji(el, el.textContent));

  $('#hero-photo').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 3, 90);
  });
  $('#open-diary').addEventListener('click', openDiary);

  // 형광펜이 다 그어지면 한 번 축하
  setTimeout(() => {
    if (!$('#screen-birthday').hidden) confetti(window.innerWidth / 2, window.innerHeight * 0.3, 120);
  }, 1300);
}

/* ================= 꽃가루 (아이폰 이모지 + 종이) ================= */
const CONFETTI_EMOJI = ['🎉', '🎂', '🎈', '💗', '✨', '🥳'];
const confettiImgs = CONFETTI_EMOJI.map((e) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = emojiCandidates(e)[0];
  return img;
});
const PAPER_COLORS = ['#ffe65c', '#ff4f9a', '#1d2b4f', '#96e2c8', '#ffffff'];
let particles = [];
let rafId = null;

function confetti(x, y, count) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('#confetti');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 8;
    const isEmoji = Math.random() < 0.35;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      size: (isEmoji ? 26 + Math.random() * 14 : 7 + Math.random() * 6) * (innerWidth < 560 ? 0.75 : 1),
      img: isEmoji ? confettiImgs[(Math.random() * confettiImgs.length) | 0] : null,
      color: PAPER_COLORS[(Math.random() * PAPER_COLORS.length) | 0],
      life: 0,
    });
  }
  if (!rafId) rafId = requestAnimationFrame(tick);

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter((p) => p.y < innerHeight + 60 && p.life < 260);
    for (const p of particles) {
      p.life++;
      p.vy += 0.28;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.img && p.img.complete && p.img.naturalWidth) {
        ctx.drawImage(p.img, -p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (particles.length) rafId = requestAnimationFrame(tick);
    else { rafId = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
}

/* ================= 2. 로그인 ================= */
async function openDiary() {
  try {
    const { me: who } = await api('/api/me');
    me = who;
    await enterDiary();
  } catch {
    await showLogin();
  }
}

async function showLogin() {
  if (!people.length) {
    try {
      people = (await api('/api/people')).people;
    } catch (e) {
      toast(e.message);
      return;
    }
  }
  const who = $('.who');
  who.textContent = '';
  for (const p of people) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'who';
    input.value = p.id;
    input.checked = p.id === 'yujin';
    const span = document.createElement('span');
    span.textContent = p.name;
    label.append(input, span);
    who.append(label);
  }
  $('#login-error').textContent = '';
  $('#login-password').value = '';
  show('screen-login');
  $('#login-password').focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.querySelector('input[name="who"]:checked')?.value;
  const password = $('#login-password').value;
  if (!userId) {
    $('#login-error').textContent = '누구인지 먼저 골라줘.';
    return;
  }
  try {
    me = (await api('/api/login', { method: 'POST', body: { userId, password } })).me;
    await enterDiary();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-password').value = '';
    $('#login-password').focus();
  }
});
$('#back-to-bday').addEventListener('click', () => show('screen-birthday'));
$('#login-password').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/D/g, '').slice(0, 4);
  $('#login-error').textContent = '';
  if (e.target.value.length === 4) $('#login-form').requestSubmit();
});
$('.who').addEventListener('change', () => $('#login-password').focus());

/* ================= 3. 교환일기 ================= */
async function enterDiary() {
  show('screen-diary');
  $('#composer').classList.toggle('is-yujin', me.id === 'yujin');
  fillWithEmoji($('#composer-label'), `${me.name}아, 오늘 이야기를 써줘 ✍🏻`);
  if (!people.length) people = (await api('/api/people').catch(() => ({ people: [] }))).people;
  renderMoods();
  await loadEntries();
}

function renderMoods() {
  const list = $('#mood-list');
  list.textContent = '';
  for (const m of MOODS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(selectedMood === m));
    b.setAttribute('aria-label', `기분 ${m}`);
    b.append(emojiImg(m));
    b.addEventListener('click', () => {
      selectedMood = selectedMood === m ? null : m;
      renderMoods();
    });
    list.append(b);
  }
}

const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit',
});

async function loadEntries() {
  let entries;
  try {
    entries = (await api('/api/entries')).entries;
  } catch (e) {
    if (e.status === 401) return showLogin();
    toast(e.message);
    return;
  }

  // 누구 차례인지
  const turn = $('#turn');
  if (!entries.length) {
    fillWithEmoji(turn, '아직 빈 일기장이야. 첫 장을 채워줘 💌');
  } else if (entries[0].authorId === me.id) {
    const other = people.find((p) => p.id !== me.id)?.name || (me.id === 'yujin' ? '지원' : '유진');
    fillWithEmoji(turn, `${other}의 답장을 기다리는 중 ⏳`);
  } else {
    fillWithEmoji(turn, '이번 장은 네가 쓸 차례야 💌');
  }

  allEntries = entries;
  renderEntryList();
}

let allEntries = [];
let writerFilter = 'all';

function renderEntryList() {
  const list = $('#entries');
  list.textContent = '';
  const shown = writerFilter === 'all' ? allEntries : allEntries.filter((e) => e.authorId === writerFilter);
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    const name = people.find((p) => p.id === writerFilter)?.name;
    fillWithEmoji(li, writerFilter === 'all' || !name
      ? '여기에 우리 둘의 일기가 쌓일 거야 📒'
      : `아직 ${name}이가 쓴 일기가 없어 📒`);
    list.append(li);
    return;
  }
  for (const e of shown) list.append(renderEntry(e));
}

$('#writer-tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-filter]');
  if (!btn) return;
  writerFilter = btn.dataset.filter;
  for (const b of document.querySelectorAll('#writer-tabs [data-filter]')) {
    b.setAttribute('aria-selected', String(b === btn));
  }
  renderEntryList();
});

function renderEntry(e) {
  const li = document.createElement('li');
  li.className = `entry ${e.authorId === 'yujin' ? 'yujin' : 'me'}`;
  const sheet = document.createElement('article');
  sheet.className = 'sheet';

  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const who = document.createElement('span');
  who.className = 'entry-who';
  who.textContent = e.authorId === me.id ? "나" : e.authorName;
  meta.append(who);
  if (e.mood) {
    const mood = document.createElement('span');
    mood.className = 'entry-mood';
    mood.append(emojiImg(e.mood));
    meta.append(mood);
  }
  const date = document.createElement('time');
  date.className = 'entry-date';
  date.dateTime = new Date(e.createdAt).toISOString();
  date.textContent = dateFmt.format(e.createdAt);
  meta.append(date);

  if (e.authorId === me.id) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'entry-del';
    del.textContent = '지우기';
    del.addEventListener('click', async () => {
      if (!confirm('이 일기를 지울까? 지우면 되돌릴 수 없어.')) return;
      try {
        await api(`/api/entries/${e.id}`, { method: 'DELETE' });
        toast('일기를 지웠어요');
        loadEntries();
      } catch (err) {
        toast(err.message);
      }
    });
    meta.append(del);
  }
  sheet.append(meta);

  if (e.text) {
    const p = document.createElement('p');
    p.className = 'entry-text';
    fillWithEmoji(p, e.text);
    sheet.append(p);
  }

  if (e.photos.length) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-photos';
    e.photos.forEach((name, i) => {
      const fig = document.createElement('button');
      fig.type = 'button';
      fig.className = 'polaroid';
      fig.setAttribute('aria-label', '사진 크게 보기');
      // 사진마다 살짝 다른 기울기
      const tilt = [-3, 2.5, -1.5, 3.5][i % 4];
      fig.style.transform = `rotate(${tilt}deg)`;
      const tape = document.createElement('span');
      tape.className = 'tape';
      tape.setAttribute('aria-hidden', 'true');
      const img = document.createElement('img');
      img.src = `/uploads/${encodeURIComponent(name)}`;
      img.alt = `${who.textContent}의 사진`;
      img.loading = 'lazy';
      fig.append(tape, img);
      fig.addEventListener('click', () => openLightbox(img.src, img.alt));
      wrap.append(fig);
    });
    sheet.append(wrap);
  }

  li.append(sheet);
  return li;
}

/* 사진 붙이기: 큰 사진은 1600px로 줄여서 올려요 */
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} 사진을 열 수 없어요. JPG나 PNG로 다시 골라줘.`));
    };
    img.src = url;
  });
}

$('#entry-photos').addEventListener('change', async (ev) => {
  const files = [...ev.target.files];
  ev.target.value = '';
  $('#composer-error').textContent = '';
  const room = MAX_PHOTOS - pendingPhotos.length;
  if (files.length > room) $('#composer-error').textContent = `사진은 ${MAX_PHOTOS}장까지만 붙일 수 있어요.`;
  for (const f of files.slice(0, Math.max(0, room))) {
    try {
      pendingPhotos.push({ dataUrl: await resizeImage(f) });
    } catch (err) {
      $('#composer-error').textContent = err.message;
    }
  }
  renderPreviews();
});

function renderPreviews() {
  const box = $('#previews');
  box.textContent = '';
  pendingPhotos.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'preview';
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.alt = `붙일 사진 ${i + 1}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `사진 ${i + 1} 빼기`);
    x.addEventListener('click', () => {
      pendingPhotos.splice(i, 1);
      renderPreviews();
    });
    d.append(img, x);
    box.append(d);
  });
  $('#photo-count').textContent = pendingPhotos.length
    ? `사진 ${pendingPhotos.length}/${MAX_PHOTOS}장`
    : `사진은 ${MAX_PHOTOS}장까지`;
}

$('#composer').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('#entry-text').value.trim();
  if (!text && !pendingPhotos.length) {
    $('#composer-error').textContent = '글이나 사진 중 하나는 있어야 해요.';
    return;
  }
  const btn = $('#submit-entry');
  btn.disabled = true;
  btn.textContent = '남기는 중…';
  $('#composer-error').textContent = '';
  try {
    // 사진은 한 장씩 먼저 올려요 (이미 올린 건 다시 안 올려요)
    for (let i = 0; i < pendingPhotos.length; i++) {
      const p = pendingPhotos[i];
      if (p.name) continue;
      btn.textContent = `사진 올리는 중 ${i + 1}/${pendingPhotos.length}`;
      p.name = (await api('/api/photos', { method: 'POST', body: { dataUrl: p.dataUrl } })).name;
    }
    btn.textContent = '남기는 중…';
    await api('/api/entries', {
      method: 'POST',
      body: { text, mood: selectedMood, photos: pendingPhotos.map((p) => p.name) },
    });
    $('#entry-text').value = '';
    pendingPhotos = [];
    selectedMood = null;
    renderPreviews();
    renderMoods();
    toast('일기를 남겼어요 💌');
    await loadEntries();
  } catch (err) {
    if (err.status === 401) return showLogin();
    $('#composer-error').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '일기 남기기';
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  me = null;
  show('screen-birthday');
});
$('#show-bday').addEventListener('click', () => show('screen-birthday'));

/* 사진 크게 보기 */
function openLightbox(src, alt) {
  const img = $('#lightbox-img');
  img.src = src;
  img.alt = alt;
  $('#lightbox').showModal();
}
$('#lightbox-close').addEventListener('click', () => $('#lightbox').close());
$('#lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') $('#lightbox').close();
});

setupBirthday();
