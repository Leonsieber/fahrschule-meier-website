// Lokale Vorschau der Webseite: node server.js  →  http://localhost:5180
// Liefert die statischen Dateien und die Texte aus data/public.json.
// Das echte Backend (Login, Konto, Verwaltung) läuft hier nicht.
// Vorschau der Konto-Seiten mit Testdaten: DEMO=student node server.js  bzw.  DEMO=admin node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5180;
const ROOT = __dirname;
const DEMO = process.env.DEMO;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const SLOTS = { 'img.hero': 'hero', 'img.about': 'portrait', 'img.car': 'auto', 'img.region': 'region' };

function publicData(lang) {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/public.json'), 'utf8'));
  const data = { content: { ...all.content.de, ...(all.content[lang] || {}) }, lessonTypes: all.lessonTypes, adminFee: all.adminFee };
  // Eigene Fotos: einfach als fotos/hero.jpg, fotos/portrait.jpg, fotos/auto.jpg ablegen
  for (const [key, name] of Object.entries(SLOTS)) {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      if (fs.existsSync(path.join(ROOT, 'fotos', `${name}.${ext}`))) { data.content[key] = `fotos/${name}.${ext}`; break; }
    }
  }
  return data;
}

const demoAppt = { id: 1, status: 'booked', start_at: '2030-03-14T17:00', minutes: 50, meeting_point: 'Bahnhof Amriswil', message: 'Bitte Lernfahrausweis mitnehmen.' };
const DEMO_API = {
  '/api/my/appointments': [demoAppt, { ...demoAppt, id: 2, status: 'done', start_at: '2024-03-07T17:00', message: '' }],
  '/api/my/orders': [{ id: 1, status: 'open', remaining: 3, qty: 5, minutes: 50, price: 90, total: 450, created_at: '2024-02-01T10:00', note: '' }],
  '/api/my/invoices': [{ id: 1, number: 'R-0001', status: 'open', total: 450, issued_at: '2024-02-01', created_at: '2024-02-01', due_at: '2030-03-01' }],
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': TYPES['.json'] }); res.end(JSON.stringify(body)); };

  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/public') return json(200, publicData(url.searchParams.get('lang') || 'de'));
    if (url.pathname === '/api/me' && req.method === 'GET') {
      const user = DEMO ? { first_name: 'Test', last_name: 'Person', email: 'test@example.com', phone: '079 000 00 00', role: DEMO === 'admin' ? 'admin' : 'student', lang: 'de' } : null;
      return json(200, { user });
    }
    if (DEMO && req.method === 'GET') return json(200, DEMO_API[url.pathname] || []);
    return json(503, { error: 'preview' });
  }

  let file = decodeURIComponent(url.pathname);
  if (file === '/') file = '/index.html';
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT) || /[\\/]\.|server\.js$/.test(full.slice(ROOT.length))) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Fahrschule Meier: http://localhost:${PORT}${DEMO ? ` (Demo: ${DEMO})` : ''}`));
