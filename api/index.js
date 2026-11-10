// Vercel 서버리스 함수: /api/* 와 /uploads/* 요청이 vercel.json 에서 여기로 와요.
const { handle } = require('../lib/handler');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const original = url.searchParams.get('p') || url.pathname;
  return handle(req, res, original);
};
