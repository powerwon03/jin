'use strict';
/* ================= 지원이 줘패기 (두더지 잡기) =================
   app.js의 $, api, show, me, people, emojiImg, fillWithEmoji, confetti 를 같이 써요. */

const GAME_SECONDS = 30;
const HOLES = 6;

const game = {
  running: false,
  score: 0,
  hits: 0,
  combo: 0,
  timeLeft: GAME_SECONDS,
  holes: [],      // { el, up, hit, upAt, timer }
  spawnTimer: null,
  clockTimer: null,
  startedAt: 0,
};

/* ---------- 구멍 만들기 ---------- */
function buildBoard() {
  const board = $('#board');
  board.textContent = '';
  game.holes = [];
  for (let i = 0; i < HOLES; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hole';
    el.setAttribute('aria-label', `${i + 1}번 구멍`);
    el.innerHTML = `
      <span class="pit"></span>
      <span class="clip"><span class="mole"><img src="/img/jiwon.webp" alt="" draggable="false" /></span></span>
      <span class="lip"></span>
      <span class="num">${i + 1}</span>`;
    board.append(el);
    game.holes.push({ el, up: false, hit: false, upAt: 0, timer: null });
  }
}

/* ---------- 효과음 (짧은 '퍽') ---------- */
let audioCtx;
function bonk(strong) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(strong ? 320 : 240, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  } catch { /* 소리가 안 나도 게임은 계속 */ }
}

/* ---------- 방망이 ---------- */
const bat = $('#bat');
let batX = 0;
let batY = 0;
let swingTimer;
function placeBat(x, y, angle) {
  batX = x;
  batY = y;
  // 방망이 굵은 끝이 손가락/마우스 위치에 오도록
  const half = bat.offsetWidth / 2 || 20;
  bat.style.transform = `translate(${x - half}px, ${y - 14}px) rotate(${angle}deg)`;
}
function swing(x, y) {
  bat.classList.add('on');
  placeBat(x, y, -30);
  clearTimeout(swingTimer);
  swingTimer = setTimeout(() => {
    placeBat(batX, batY, 28);
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setTimeout(() => bat.classList.remove('on'), 160); // 터치 화면은 휘두르고 사라지기
    }
  }, 90);
}
window.addEventListener('pointermove', (e) => {
  if ($('#screen-game').hidden || e.pointerType !== 'mouse') return;
  const overBoard = e.target.closest && e.target.closest('.board');
  bat.classList.toggle('on', Boolean(overBoard));
  placeBat(e.clientX, e.clientY, 28);
});

/* ---------- 점수 팝업 ---------- */
function popText(x, y, text, miss) {
  const wrap = $('.board-wrap');
  const r = wrap.getBoundingClientRect();
  const el = document.createElement('span');
  el.className = `pop${miss ? ' miss' : ''}`;
  el.style.left = `${x - r.left}px`;
  el.style.top = `${y - r.top}px`;
  fillWithEmoji(el, text);
  wrap.append(el);
  setTimeout(() => el.remove(), 800);
}
function boom(x, y) {
  const wrap = $('.board-wrap');
  const r = wrap.getBoundingClientRect();
  const img = emojiImg('💥');
  img.className = 'emoji boom';
  img.style.left = `${x - r.left}px`;
  img.style.top = `${y - r.top}px`;
  wrap.append(img);
  setTimeout(() => img.remove(), 400);
}

/* ---------- 튀어나오기 ---------- */
function level() {
  // 시간이 지날수록 빨라져요 (0 → 1)
  return Math.min(1, (Date.now() - game.startedAt) / (GAME_SECONDS * 1000));
}
function popUp() {
  const free = game.holes.filter((h) => !h.up);
  if (!free.length) return;
  const h = free[(Math.random() * free.length) | 0];
  const stay = 1150 - 550 * level(); // 1.15초 → 0.6초
  h.up = true;
  h.hit = false;
  h.upAt = performance.now();
  h.el.classList.add('up');
  h.el.classList.remove('hit');
  h.timer = setTimeout(() => goDown(h), stay);
}
function goDown(h) {
  clearTimeout(h.timer);
  h.up = false;
  h.el.classList.remove('up', 'hit');
}
function scheduleSpawn() {
  if (!game.running) return;
  popUp();
  // 중반부터는 가끔 두 명이 같이 나와요
  if (level() > 0.4 && Math.random() < 0.35) setTimeout(popUp, 180);
  const gap = 850 - 400 * level() + Math.random() * 250;
  game.spawnTimer = setTimeout(scheduleSpawn, gap);
}

/* ---------- 때리기 ---------- */
function whack(h, x, y) {
  if (!game.running) return;
  swing(x, y);
  if (!h || !h.up || h.hit) {
    game.combo = 0;
    popText(x, y, '헛스윙!', true);
    return;
  }
  const reaction = performance.now() - h.upAt;
  h.hit = true;
  h.el.classList.add('hit');
  clearTimeout(h.timer);
  h.timer = setTimeout(() => goDown(h), 260);

  game.hits += 1;
  game.combo += 1;
  let pts = 10;
  let label = '+10';
  if (reaction < 450) { pts += 10; label = '+20 빠르다! ⚡'; }
  if (game.combo > 0 && game.combo % 5 === 0) { pts += 15; label = `+${pts} ${game.combo}콤보! 🔥`; }
  game.score += pts;
  $('#g-score').textContent = game.score;

  boom(x, y - 10);
  popText(x, y - 40, label);
  bonk(pts > 10);
  if (navigator.vibrate) navigator.vibrate(25);
  const board = $('#board');
  board.classList.remove('shake');
  void board.offsetWidth;
  board.classList.add('shake');
}

$('#board').addEventListener('pointerdown', (e) => {
  if (!game.running) return;
  e.preventDefault();
  const holeEl = e.target.closest('.hole');
  const h = game.holes.find((x) => x.el === holeEl);
  whack(h, e.clientX, e.clientY);
});
// 키보드: 1~6 숫자키, 또는 구멍에 포커스 두고 Enter/Space
window.addEventListener('keydown', (e) => {
  if ($('#screen-game').hidden || !game.running) return;
  let h = null;
  if (/^[1-6]$/.test(e.key)) h = game.holes[Number(e.key) - 1];
  else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('hole')) {
    h = game.holes.find((x) => x.el === document.activeElement);
  }
  if (!h) return;
  e.preventDefault();
  const r = h.el.getBoundingClientRect();
  whack(h, r.left + r.width / 2, r.top + r.height * 0.4);
});

/* ---------- 시작 / 끝 ---------- */
function nameOf(id) {
  return people.find((p) => p.id === id)?.name || (id === 'yujin' ? '유진' : '지원');
}

async function showBest() {
  try {
    const s = await api('/api/scores');
    const parts = ['yujin', 'me'].map((id) => `${nameOf(id)} 최고 ${s.best[id]?.score ?? 0}점`);
    fillWithEmoji($('#g-best'), `🏆 ${parts.join(',  ')}`);
  } catch {
    $('#g-best').textContent = '';
  }
}

function startGame() {
  game.running = true;
  game.score = 0;
  game.hits = 0;
  game.combo = 0;
  game.timeLeft = GAME_SECONDS;
  game.startedAt = Date.now();
  $('#g-score').textContent = '0';
  $('#g-time').textContent = String(GAME_SECONDS);
  $('#g-time').parentElement.classList.remove('hurry');
  $('#g-overlay').hidden = true;
  game.holes.forEach(goDown);
  setTimeout(scheduleSpawn, 400);
  game.clockTimer = setInterval(() => {
    game.timeLeft -= 1;
    $('#g-time').textContent = String(game.timeLeft);
    if (game.timeLeft <= 5) $('#g-time').parentElement.classList.add('hurry');
    if (game.timeLeft <= 0) endGame();
  }, 1000);
}

function stopGame() {
  game.running = false;
  clearTimeout(game.spawnTimer);
  clearInterval(game.clockTimer);
  game.holes.forEach(goDown);
}

async function endGame() {
  stopGame();
  bat.classList.remove('on');
  let result = null;
  try {
    result = await api('/api/scores', { method: 'POST', body: { score: game.score } });
  } catch { /* 저장이 안 돼도 결과는 보여줘요 */ }

  const title = $('#g-ov-title');
  const text = $('#g-ov-text');
  fillWithEmoji(title, `${game.score}점! 🎉`);
  let msg;
  if (game.hits === 0) msg = '지원이가 한 대도 안 맞았어. 다시 해볼까? 😏';
  else if (game.hits < 10) msg = `지원이가 ${game.hits}대 맞았어. 아직 봐준 거지? 🤭`;
  else if (game.hits < 25) msg = `지원이가 ${game.hits}대 맞고 정신이 없어 😵‍💫`;
  else msg = `지원이가 ${game.hits}대 맞고 완전히 뻗었어 🫠`;
  if (result?.isBest && game.score > 0) msg += '  최고 기록이야! 🏆';
  fillWithEmoji(text, msg);
  $('#g-start').textContent = '다시 하기';
  $('#g-overlay').hidden = false;
  $('#g-start').focus();
  if (result?.isBest && game.score > 0) {
    const r = $('#g-overlay').getBoundingClientRect();
    confetti(r.left + r.width / 2, r.top + r.height / 3, 100);
  }
  showBest();
}

async function openGame() {
  stopGame();
  show('screen-game');
  if (!game.holes.length) buildBoard();
  fillWithEmoji($('#g-ov-title'), '지원이를 혼내줄 시간 😤');
  $('#g-ov-text').textContent = `${GAME_SECONDS}초 동안 튀어나오는 지원이를 방망이로 때려줘. 빨리 때릴수록 점수가 커져.`;
  $('#g-start').textContent = '시작하기';
  $('#g-overlay').hidden = false;
  $('#g-score').textContent = '0';
  $('#g-time').textContent = String(GAME_SECONDS);
  showBest();
}

$('#g-start').addEventListener('click', startGame);
$('#open-game').addEventListener('click', openGame);
$('#game-back').addEventListener('click', () => {
  stopGame();
  bat.classList.remove('on');
  enterDiary();
});
