// Local stand-in for Vercel for the browser test (e2e.py): static files + the real api/assist.js, with the
// production headers from vercel.json. Gemini is replaced by a fake, so no key or network is needed.
// Usage: node e2e/server.js ai|fallback PORT
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const [mode, port] = [process.argv[2], Number(process.argv[3])];
const prod = Object.fromEntries(JSON.parse(fs.readFileSync(root + '/vercel.json', 'utf8')).headers[0].headers.map((h) => [h.key, h.value]));
const { createHandler } = require(root + '/api/assist.js');
const GOOD_AI = { focus: 'আগে কমিটি গড়ো।', ideas: ['আইডিয়া ১', 'আইডিয়া ২', 'আইডিয়া ৩', 'আইডিয়া ৪', 'আইডিয়া ৫'], savingTips: ['টিপ ১', 'টিপ ২', 'টিপ ৩'], messageDraft: 'নমস্কার!\nচাঁদা দিলে খুশি হব।' };
const fakeGemini = async (url, init) => {
  const asking = JSON.parse(init.body).systemInstruction.parts[0].text.includes('answer ONE question');
  const text = JSON.stringify(asking ? { answer: 'AI-এর উত্তর: আগে সাউন্ড আর প্যান্ডেল বুক করো।' } : GOOD_AI);
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
};
const handler = createHandler({ env: () => (mode === 'ai' ? { GEMINI_API_KEY: 'fake-key' } : {}), fetch: fakeGemini, log: () => {} });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/assist') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } handler(req, res); });
    return;
  }
  const file = url === '/' ? '/index.html' : url;
  const full = path.join(root, path.normalize(file));
  const ok = full.startsWith(root) && fs.existsSync(full) && fs.statSync(full).isFile() && !full.includes('/api/') && !/\.(test\.js|md|json|yml)$/.test(full);
  const target = ok ? full : path.join(root, '404.html');
  for (const [k, v] of Object.entries(prod)) res.setHeader(k, v);
  res.statusCode = ok ? 200 : 404;
  res.setHeader('Content-Type', types[path.extname(target)] || 'text/plain');
  res.end(fs.readFileSync(target));
}).listen(port, '127.0.0.1');