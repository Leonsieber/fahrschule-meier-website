// Backend der Webseite: Login, Schülerkonto, Verwaltung, Rechnungen.
// Läuft als eine Funktion auf Vercel (api/index.mjs) und lokal über server.js.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import * as store from './store.mjs';
import { billData } from './qrbill.mjs';

const require = createRequire(import.meta.url);
const PUBLIC = require('../data/public.json');

const scrypt = promisify(scryptCb);
const LANGS = ['de', 'en', 'fr', 'it'];
const COOKIE = 'fm_session';
const SESSION_DAYS = 30;
const MAX_IMAGE = 4 * 1024 * 1024;

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const bad = (code = 'generic') => new ApiError(400, code);
const denied = () => new ApiError(401, 'unauthorized');
const notFound = () => new ApiError(404, 'not_found');

// ---------- Passwörter und Sitzung ----------
export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `s1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
async function verifyPassword(pw, stored) {
  const [, salt, key] = String(stored).split('$');
  if (!salt || !key) return false;
  const want = Buffer.from(key, 'base64url');
  const got = await scrypt(pw, Buffer.from(salt, 'base64url'), want.length);
  return timingSafeEqual(want, got);
}
const DUMMY = 's1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error('SESSION_SECRET fehlt');
  return 'nur-lokal';
}
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');
function makeToken(u) {
  const data = Buffer.from(JSON.stringify({ u: u.id, v: u.session_v, e: Date.now() + SESSION_DAYS * 864e5 })).toString('base64url');
  return `${data}.${sign(data)}`;
}
function readToken(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [data, sig] = m[1].split('.');
  if (!data || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(data, 'base64url').toString());
    return t.e > Date.now() ? t : null;
  } catch { return null; }
}
function sessionCookie(req, value, maxAge) {
  const https = (req.headers.get('x-forwarded-proto') || new URL(req.url).protocol.replace(':', '')) === 'https';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https ? '; Secure' : ''}`;
}
const clientIp = (req) => (req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for') || 'lokal').split(',')[0].trim();

// ---------- Anfangsdaten ----------
async function seed() {
  const db = {
    seq: { user: 1, order: 0, appt: 0, invoice: 0, lt: PUBLIC.lessonTypes.length },
    users: [],
    lessonTypes: PUBLIC.lessonTypes.map((l) => ({ id: l.id, minutes: l.minutes, price: l.price, active: true })),
    orders: [], appointments: [], invoices: [],
    content: {}, images: {}, attempts: {},
    settings: { admin_fee: String(PUBLIC.adminFee), invoice_due_days: '30', default_meeting_point: 'Nach Absprache', auto_invoice: '1', creditor_name: '', creditor_street: '', creditor_zip: '', creditor_city: '', iban: '' },
  };
  const email = process.env.ADMIN_EMAIL, hash = process.env.ADMIN_PASSWORD_HASH;
  if (email && hash) {
    db.users.push({ id: 1, role: 'admin', first_name: 'Andreas', last_name: 'Meier', email: email.toLowerCase(), phone: '', street: '', zip_city: '', birthdate: '', lang: 'de', active: true, session_v: 1, password: hash, created_at: new Date().toISOString() });
  }
  return db;
}
const readDb = async () => (await store.read(seed)).db;
const updateDb = (fn) => { publicCache.clear(); return store.update(seed, fn); };
// Besucher ohne Anmeldung: kurz zwischenspeichern, das spart Zugriffe auf den Speicher
const publicCache = new Map();
const PUBLIC_TTL = 60e3;

// ---------- Schutz vor zu vielen Versuchen ----------
const hits = (db, key, windowMin) => {
  const since = Date.now() - windowMin * 6e4;
  db.attempts[key] = (db.attempts[key] || []).filter((t) => t > since);
  return db.attempts[key].length;
};
function pruneAttempts(db) {
  const since = Date.now() - 864e5;
  for (const k of Object.keys(db.attempts)) {
    db.attempts[k] = db.attempts[k].filter((t) => t > since);
    if (!db.attempts[k].length) delete db.attempts[k];
  }
}

// ---------- Hilfen ----------
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const money = (n) => Math.round(n * 100) / 100;
const id = (v) => Number(v);
const today = () => new Date().toISOString().slice(0, 10);

function publicUser(u) {
  if (!u) return null;
  const { password, session_v, ...rest } = u;
  return rest;
}
const person = (db, userId) => {
  const u = db.users.find((x) => x.id === userId) || {};
  return { first_name: u.first_name || '', last_name: u.last_name || '', phone: u.phone || '' };
};
function orderView(db, o) {
  const scheduled = db.appointments.filter((a) => a.order_id === o.id && a.status !== 'cancelled').length;
  const remaining = o.closed ? 0 : Math.max(0, o.qty - scheduled);
  return { ...o, scheduled, remaining, status: o.closed ? 'closed' : remaining ? 'open' : 'done', total: money(o.qty * o.price) };
}
const byNewest = (a, b) => String(b.created_at).localeCompare(String(a.created_at));

function publicData(db, lang) {
  const l = LANGS.includes(lang) ? lang : 'de';
  const fee = num(db.settings.admin_fee);
  return {
    content: { ...PUBLIC.content.de, ...(db.content.de || {}), ...(PUBLIC.content[l] || {}), ...(db.content[l] || {}), ...db.images },
    lessonTypes: db.lessonTypes.filter((t) => t.active).sort((a, b) => a.minutes - b.minutes).map(({ id: i, minutes, price }) => ({ id: i, minutes, price })),
    adminFee: fee,
  };
}

function makeInvoice(db, userId, items) {
  const clean = items.map((i) => ({ description: str(i.description, 300), unit_price: money(num(i.unit_price)), qty: Math.max(1, Math.round(num(i.qty) || 1)) }))
    .filter((i) => i.description && Number.isFinite(i.unit_price));
  if (!clean.length) throw bad();
  const n = ++db.seq.invoice;
  const days = parseInt(db.settings.invoice_due_days, 10) || 30;
  const inv = {
    id: n, number: `R-${String(n).padStart(4, '0')}`, user_id: userId, status: 'open', items: clean,
    total: money(clean.reduce((s, i) => s + i.unit_price * i.qty, 0)),
    created_at: today(), issued_at: today(), due_at: new Date(Date.now() + days * 864e5).toISOString().slice(0, 10), paid_at: null,
  };
  db.invoices.push(inv);
  return inv;
}

function setUserFields(u, b) {
  if ('first_name' in b) u.first_name = str(b.first_name, 80);
  if ('last_name' in b) u.last_name = str(b.last_name, 80);
  if ('phone' in b) u.phone = str(b.phone, 40);
  if ('street' in b) u.street = str(b.street, 120);
  if ('zip_city' in b) u.zip_city = str(b.zip_city, 120);
  if ('birthdate' in b) u.birthdate = /^\d{4}-\d{2}-\d{2}$/.test(b.birthdate) ? b.birthdate : '';
  if ('lang' in b && LANGS.includes(b.lang)) u.lang = b.lang;
  if (!u.first_name || !u.last_name) throw bad('name_required');
}
function apptFields(db, b) {
  const date = str(b.date), start = str(b.start);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) throw bad();
  const lt = db.lessonTypes.find((l) => l.id === id(b.lesson_type_id));
  if (!lt) throw bad();
  return {
    start_at: `${date}T${start}`, lesson_type_id: lt.id, minutes: lt.minutes, price: lt.price,
    meeting_point: str(b.meeting_point, 200) || db.settings.default_meeting_point || '',
    message: str(b.message, 1000),
  };
}
const need = (cond, err = notFound()) => { if (!cond) throw err; };

// ---------- Routen ----------
// r: nur lesen, w: schreiben. auth: 'user', 'admin' oder leer.
const routes = [];
const route = (method, pattern, kind, auth, fn) => routes.push({ method, re: new RegExp(`^/api/${pattern}$`), kind, auth, fn });

route('GET', 'public', 'r', '', ({ db, url }) => publicData(db, url.searchParams.get('lang')));
route('GET', 'me', 'r', '', ({ user }) => ({ user: publicUser(user) }));

route('POST', 'logout', 'none', '', ({ req }) => ({ __cookie: sessionCookie(req, '', 0), ok: true }));

route('POST', 'login', 'custom', '', async ({ req, body }) => {
  const email = str(body.email, 200).toLowerCase(), ip = clientIp(req);
  const db = await readDb();
  if (hits(db, 'ip:' + ip, 15) >= 20 || hits(db, 'mail:' + email, 15) >= 8) throw new ApiError(429, 'too_many');
  const u = db.users.find((x) => x.email === email);
  const ok = await verifyPassword(String(body.password || ''), u ? u.password : DUMMY);
  if (!u || !ok) {
    await updateDb((d) => {
      pruneAttempts(d);
      const now = Date.now();
      (d.attempts['ip:' + ip] ||= []).push(now);
      (d.attempts['mail:' + email] ||= []).push(now);
    });
    throw new ApiError(401, 'wrong_login');
  }
  if (!u.active) throw new ApiError(403, 'inactive');
  return { __cookie: sessionCookie(req, makeToken(u), SESSION_DAYS * 86400), user: publicUser(u) };
});

route('POST', 'register', 'custom', '', async ({ req, body }) => {
  const email = str(body.email, 200).toLowerCase(), ip = clientIp(req);
  const pw = String(body.password || '');
  if (!str(body.first_name) || !str(body.last_name)) throw bad('name_required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid_email');
  if (!str(body.phone)) throw bad('phone_required');
  if (pw.length < 8) throw bad('password_short');
  const hash = await hashPassword(pw);
  const u = await updateDb((db) => {
    pruneAttempts(db);
    if (hits(db, 'reg:' + ip, 60) >= 5) throw new ApiError(429, 'too_many');
    if (db.users.some((x) => x.email === email)) throw new ApiError(409, 'email_taken');
    (db.attempts['reg:' + ip] ||= []).push(Date.now());
    const user = { id: ++db.seq.user, role: 'student', email, active: true, session_v: 1, password: hash, created_at: new Date().toISOString(), lang: 'de', street: '', zip_city: '', birthdate: '', first_name: '', last_name: '', phone: '' };
    setUserFields(user, body);
    db.users.push(user);
    return user;
  });
  return { __cookie: sessionCookie(req, makeToken(u), SESSION_DAYS * 86400), user: publicUser(u) };
});

route('PUT', 'me', 'w', 'user', ({ db, user, body }) => {
  const u = db.users.find((x) => x.id === user.id);
  setUserFields(u, body);
  return { user: publicUser(u) };
});
route('POST', 'me/password', 'custom-user', 'user', async ({ req, body, token }) => {
  const next = String(body.next || '');
  if (next.length < 8) throw bad('password_short');
  const hash = await hashPassword(next);
  const db = await readDb();
  const cur = db.users.find((x) => x.id === token.u);
  need(cur, denied());
  if (!(await verifyPassword(String(body.current || ''), cur.password))) throw bad('wrong_password');
  const u = await updateDb((d) => {
    const x = d.users.find((y) => y.id === token.u);
    x.password = hash; x.session_v += 1;
    return x;
  });
  return { __cookie: sessionCookie(req, makeToken(u), SESSION_DAYS * 86400), ok: true };
});

// ----- Schüler -----
route('GET', 'my/appointments', 'r', 'user', ({ db, user }) => db.appointments.filter((a) => a.user_id === user.id).sort((a, b) => b.start_at.localeCompare(a.start_at)));
route('GET', 'my/orders', 'r', 'user', ({ db, user }) => db.orders.filter((o) => o.user_id === user.id).map((o) => orderView(db, o)).sort(byNewest));
route('GET', 'my/invoices', 'r', 'user', ({ db, user }) => db.invoices.filter((i) => i.user_id === user.id).sort(byNewest));
route('POST', 'orders', 'w', 'user', ({ db, user, body }) => {
  const lt = db.lessonTypes.find((l) => l.id === id(body.lesson_type_id) && l.active);
  const qty = Math.round(num(body.qty));
  need(lt && qty >= 1 && qty <= 20, bad());
  const o = { id: ++db.seq.order, user_id: user.id, lesson_type_id: lt.id, minutes: lt.minutes, price: lt.price, qty, note: str(body.note, 500), closed: false, created_at: new Date().toISOString() };
  db.orders.push(o);
  return orderView(db, o);
});
route('POST', 'orders/(\\d+)/cancel', 'w', 'user', ({ db, user, params }) => {
  const o = db.orders.find((x) => x.id === id(params[0]) && x.user_id === user.id);
  need(o);
  if (orderView(db, o).scheduled) o.closed = true;
  else db.orders.splice(db.orders.indexOf(o), 1);
  return { ok: true };
});
route('GET', 'invoices/(\\d+)', 'r', 'user', async ({ db, user, params }) => {
  const inv = db.invoices.find((i) => i.id === id(params[0]));
  need(inv && (user.role === 'admin' || inv.user_id === user.id));
  return { invoice: inv, ...(await billData(inv, db.users.find((u) => u.id === inv.user_id) || {}, db.settings)) };
});

// ----- Verwaltung -----
route('GET', 'admin/settings', 'r', 'admin', ({ db }) => ({ settings: db.settings, lessonTypes: [...db.lessonTypes].sort((a, b) => a.minutes - b.minutes) }));
route('PUT', 'admin/settings', 'w', 'admin', ({ db, body }) => {
  for (const k of ['default_meeting_point', 'creditor_name', 'creditor_street', 'creditor_zip', 'creditor_city']) if (k in body) db.settings[k] = str(body[k], 120);
  if ('iban' in body) db.settings.iban = str(body.iban, 40).replace(/\s+/g, '').toUpperCase();
  if ('admin_fee' in body) { const f = num(body.admin_fee); need(f >= 0, bad()); db.settings.admin_fee = String(f); }
  if ('invoice_due_days' in body) { const d = Math.round(num(body.invoice_due_days)); need(d >= 0, bad()); db.settings.invoice_due_days = String(d); }
  if ('auto_invoice' in body) db.settings.auto_invoice = String(body.auto_invoice) === '1' ? '1' : '0';
  return { settings: db.settings };
});
route('POST', 'admin/lesson-types', 'w', 'admin', ({ db, body }) => {
  const minutes = Math.round(num(body.minutes)), price = money(num(body.price));
  need(minutes > 0 && price >= 0, bad());
  const lt = { id: ++db.seq.lt, minutes, price, active: true };
  db.lessonTypes.push(lt);
  return lt;
});
route('PUT', 'admin/lesson-types/(\\d+)', 'w', 'admin', ({ db, body, params }) => {
  const lt = db.lessonTypes.find((l) => l.id === id(params[0]));
  need(lt);
  const minutes = Math.round(num(body.minutes)), price = money(num(body.price));
  need(minutes > 0 && price >= 0, bad());
  lt.minutes = minutes; lt.price = price;
  if ('active' in body) lt.active = !!body.active;
  return lt;
});
route('PUT', 'admin/content', 'w', 'admin', ({ db, body }) => {
  const key = str(body.key, 80), lang = body.lang, value = String(body.value ?? '').slice(0, 20000);
  need(/^[a-z0-9_.]+$/.test(key) && !key.startsWith('img.') && LANGS.includes(lang), bad());
  (db.content[lang] ||= {})[key] = value;
  return { ok: true };
});

route('GET', 'admin/orders', 'r', 'admin', ({ db }) => db.orders.map((o) => orderView(db, o)).filter((o) => o.status === 'open').map((o) => ({ ...o, ...person(db, o.user_id) })).sort(byNewest));
route('POST', 'admin/orders/(\\d+)/close', 'w', 'admin', ({ db, params }) => {
  const o = db.orders.find((x) => x.id === id(params[0]));
  need(o);
  o.closed = true;
  return { ok: true };
});

route('GET', 'admin/slots', 'r', 'admin', ({ db, url }) => {
  const from = url.searchParams.get('from') || '0000', to = url.searchParams.get('to') || '9999';
  return db.appointments
    .filter((a) => a.status !== 'cancelled' && a.start_at.slice(0, 10) >= from && a.start_at.slice(0, 10) <= to)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((a) => ({ ...a, ...person(db, a.user_id) }));
});
route('POST', 'admin/appointments', 'w', 'admin', ({ db, body }) => {
  const st = db.users.find((u) => u.id === id(body.user_id) && u.role === 'student');
  need(st, bad());
  const f = apptFields(db, body);
  let orderId = null;
  if (body.order_id) {
    const o = db.orders.find((x) => x.id === id(body.order_id) && x.user_id === st.id);
    need(o, bad());
    orderId = o.id;
  }
  const a = { id: ++db.seq.appt, user_id: st.id, order_id: orderId, status: 'booked', invoice_id: null, created_at: new Date().toISOString(), ...f };
  db.appointments.push(a);
  return a;
});
route('PUT', 'admin/appointments/(\\d+)', 'w', 'admin', ({ db, body, params }) => {
  const a = db.appointments.find((x) => x.id === id(params[0]));
  need(a);
  Object.assign(a, apptFields(db, body));
  return a;
});
route('DELETE', 'admin/appointments/(\\d+)', 'w', 'admin', ({ db, params }) => {
  const a = db.appointments.find((x) => x.id === id(params[0]));
  need(a);
  a.status = 'cancelled';
  return { ok: true };
});
route('POST', 'admin/appointments/(\\d+)/done', 'w', 'admin', ({ db, body, params }) => {
  const a = db.appointments.find((x) => x.id === id(params[0]));
  need(a && a.status !== 'cancelled');
  if (a.status === 'done') return { invoiceId: a.invoice_id };
  a.status = 'done';
  if (!body.invoice) return { invoiceId: null };
  const items = [{ description: `Fahrstunde ${a.minutes} Min., ${a.start_at.slice(8, 10)}.${a.start_at.slice(5, 7)}.${a.start_at.slice(0, 4)}`, unit_price: a.price, qty: 1 }];
  const fee = num(db.settings.admin_fee);
  const first = !db.invoices.some((i) => i.user_id === a.user_id && i.status !== 'cancelled');
  if (first && fee > 0) items.push({ description: 'Einmalige Administrations- und Versicherungsgebühr', unit_price: fee, qty: 1 });
  a.invoice_id = makeInvoice(db, a.user_id, items).id;
  return { invoiceId: a.invoice_id };
});

route('GET', 'admin/students', 'r', 'admin', ({ db }) => db.users.map((u) => {
  const appts = db.appointments.filter((a) => a.user_id === u.id);
  return {
    ...publicUser(u),
    lessons_done: appts.filter((a) => a.status === 'done').length,
    lessons_booked: appts.filter((a) => a.status === 'booked').length,
    lessons_requested: db.orders.filter((o) => o.user_id === u.id).reduce((s, o) => s + orderView(db, o).remaining, 0),
    open_amount: money(db.invoices.filter((i) => i.user_id === u.id && i.status === 'open').reduce((s, i) => s + i.total, 0)),
  };
}));
route('GET', 'admin/students/(\\d+)', 'r', 'admin', ({ db, params }) => {
  const u = db.users.find((x) => x.id === id(params[0]));
  need(u);
  return {
    user: publicUser(u),
    appointments: db.appointments.filter((a) => a.user_id === u.id).sort((a, b) => b.start_at.localeCompare(a.start_at)),
    orders: db.orders.filter((o) => o.user_id === u.id).map((o) => orderView(db, o)).sort(byNewest),
    invoices: db.invoices.filter((i) => i.user_id === u.id).sort(byNewest),
  };
});
route('PUT', 'admin/students/(\\d+)', 'custom-admin', 'admin', async ({ body, params, token }) => {
  const pw = body.password ? String(body.password) : '';
  if (pw && pw.length < 8) throw bad('password_short');
  const hash = pw ? await hashPassword(pw) : null;
  return updateDb((db) => {
    const u = db.users.find((x) => x.id === id(params[0]));
    need(u);
    setUserFields(u, body);
    if ('active' in body && u.id !== token.u) { const was = u.active; u.active = !!body.active; if (was && !u.active) u.session_v += 1; }
    if (hash) { u.password = hash; u.session_v += 1; }
    return { user: publicUser(u) };
  });
});

route('GET', 'admin/invoices', 'r', 'admin', ({ db }) => db.invoices.map((i) => ({ ...i, ...person(db, i.user_id) })).sort((a, b) => b.id - a.id));
route('POST', 'admin/invoices', 'w', 'admin', ({ db, body }) => {
  const st = db.users.find((u) => u.id === id(body.user_id));
  need(st && Array.isArray(body.items), bad());
  return makeInvoice(db, st.id, body.items);
});
route('PUT', 'admin/invoices/(\\d+)/status', 'w', 'admin', ({ db, body, params }) => {
  const inv = db.invoices.find((i) => i.id === id(params[0]));
  need(inv && ['open', 'paid', 'cancelled'].includes(body.status), bad());
  inv.status = body.status;
  inv.paid_at = body.status === 'paid' ? today() : null;
  return inv;
});

// ----- Bilder -----
const imgKey = (k) => /^img\.[a-z]+$/.test(k);
route('POST', 'admin/image/([a-z.]+)', 'image', 'admin', async ({ req, params }) => {
  const key = params[0];
  need(imgKey(key), bad());
  const fd = await req.formData();
  const file = fd.get('file');
  need(file && typeof file.arrayBuffer === 'function' && /^image\/(jpeg|png|webp|avif)$/.test(file.type), bad('image_type'));
  if (file.size > MAX_IMAGE) throw bad('too_large');
  await store.putFile(`images/${key}`, Buffer.from(await file.arrayBuffer()), file.type);
  const url = `api/img/${key}?v=${Date.now().toString(36)}`;
  await updateDb((db) => { db.images[key] = url; });
  return { url };
});
route('DELETE', 'admin/image/([a-z.]+)', 'w', 'admin', async ({ db, params }) => {
  need(imgKey(params[0]), bad());
  delete db.images[params[0]];
  await store.delFile(`images/${params[0]}`);
  return { ok: true };
});

// ---------- Ablauf einer Anfrage ----------
function json(status, data, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function guard(auth, user) {
  if (!auth) return;
  if (!user) throw denied();
  if (auth === 'admin' && user.role !== 'admin') throw new ApiError(403, 'forbidden');
}
const current = (db, token) => {
  if (!token) return null;
  const u = db.users.find((x) => x.id === token.u);
  return u && u.active && u.session_v === token.v ? u : null;
};

export async function handle(req, pathOverride) {
  try {
    const url = new URL(req.url);
    const path = pathOverride || url.pathname;

    // Bilder liegen privat und werden von hier ausgeliefert
    const img = path.match(/^\/api\/img\/([a-z.]+)$/);
    if (img && req.method === 'GET') {
      const f = imgKey(img[1]) ? await store.getFile(`images/${img[1]}`) : null;
      if (!f) return json(404, { error: 'not_found' });
      return new Response(f.buf, { headers: { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
    }

    let hit = null, params = [];
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = path.match(r.re);
      if (m) { hit = r; params = m.slice(1); break; }
    }
    if (!hit) return json(404, { error: 'not_found' });

    // Schreibende Anfragen nur von der eigenen Seite (fremde Seiten können diesen Header nicht setzen)
    if (req.method !== 'GET' && req.headers.get('x-requested-with') !== 'fetch') throw new ApiError(403, 'forbidden');

    const token = readToken(req);
    if (path === '/api/me' && !token) return json(200, { user: null });

    let body = {};
    if (req.method !== 'GET' && (req.headers.get('content-type') || '').includes('application/json')) {
      try { const text = await req.text(); body = text ? JSON.parse(text) : {}; } catch { throw bad(); }
    }
    const ctx = { req, url, params, body, token };

    if (path === '/api/public' && !token) {
      const c = publicCache.get(url.search);
      if (c && Date.now() - c.at < PUBLIC_TTL) return json(200, c.result);
    }

    let result;
    if (hit.kind === 'r') {
      const db = await readDb();
      const user = current(db, token);
      guard(hit.auth, user);
      result = await hit.fn({ ...ctx, db, user });
    } else if (hit.kind === 'w') {
      result = await updateDb(async (db) => {
        const user = current(db, token);
        guard(hit.auth, user);
        return hit.fn({ ...ctx, db, user });
      });
    } else if (hit.kind === 'none') {
      result = await hit.fn(ctx);
    } else {
      if (hit.auth) {
        const db = await readDb();
        guard(hit.auth, current(db, token));
      }
      result = await hit.fn(ctx);
    }

    if (path === '/api/public') {
      if (!token) publicCache.set(url.search, { at: Date.now(), result });
      return json(200, result);
    }
    if (result && result.__cookie) {
      const { __cookie, ...rest } = result;
      return json(200, rest, { 'Set-Cookie': __cookie });
    }
    return json(200, result ?? { ok: true });
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.code });
    console.error('API-Fehler:', e && e.message);
    return json(500, { error: 'generic' });
  }
}
