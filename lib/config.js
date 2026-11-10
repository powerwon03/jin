// 두 사람의 이름과 로그인 번호
// - Vercel: 환경변수 JIWON_PIN, YUJIN_PIN, SESSION_SECRET
// - 내 컴퓨터: config.json (없으면 자동으로 만들어요)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

function fromEnv() {
  const { JIWON_PIN, YUJIN_PIN, SESSION_SECRET } = process.env;
  if (!JIWON_PIN || !YUJIN_PIN) return null;
  return {
    users: [
      { id: 'me', name: '지원', password: String(JIWON_PIN) },
      { id: 'yujin', name: '유진', password: String(YUJIN_PIN) },
    ],
    // SESSION_SECRET이 없으면 번호로 만든 값 사용 (가능하면 꼭 넣어주세요)
    secret: SESSION_SECRET || crypto.createHash('sha256').update(`yujin-diary:${JIWON_PIN}:${YUJIN_PIN}`).digest('hex'),
  };
}

function fromFile() {
  if (!fs.existsSync(CONFIG_FILE)) {
    if (process.env.VERCEL) {
      throw new Error('Vercel 환경변수 JIWON_PIN, YUJIN_PIN, SESSION_SECRET 을 설정해주세요.');
    }
    const cfg = {
      users: [
        { id: 'me', name: '지원', password: crypto.randomBytes(2).readUInt16BE().toString().padStart(4, '0').slice(-4) },
        { id: 'yujin', name: '유진', password: crypto.randomBytes(2).readUInt16BE().toString().padStart(4, '0').slice(-4) },
      ],
      secret: crypto.randomBytes(32).toString('hex'),
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('\n[처음 실행] config.json을 만들었어요. 거기서 로그인 번호를 바꿀 수 있어요.\n');
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!cfg.secret) cfg.secret = crypto.randomBytes(32).toString('hex');
  return cfg;
}

let cached;
function getConfig() {
  if (!cached) cached = fromEnv() || fromFile();
  return cached;
}

module.exports = { getConfig };
