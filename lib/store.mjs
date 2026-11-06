// Datenablage: auf Vercel in einem privaten Blob-Speicher, lokal in .data/.
// Alle Daten liegen in einem JSON-Dokument. Geschrieben wird nur, wenn sich das
// Dokument seit dem Lesen nicht geändert hat; sonst läuft die Änderung erneut.
import fs from 'node:fs/promises';
import path from 'node:path';

const DB = 'db.json';

export class Conflict extends Error {}

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

const blobBackend = {
  async read() {
    const { get } = await import('@vercel/blob');
    const r = await get(DB, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return { text: await new Response(r.stream).text(), etag: r.blob.etag };
  },
  async write(text, etag) {
    const { put, BlobPreconditionFailedError } = await import('@vercel/blob');
    const opt = { access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60 };
    try {
      await put(DB, text, etag ? { ...opt, ifMatch: etag } : { ...opt, allowOverwrite: false });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || !etag) throw new Conflict();
      throw e;
    }
  },
  async putFile(name, buf, type) {
    const { put } = await import('@vercel/blob');
    await put(name, buf, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: type });
  },
  async getFile(name) {
    const { get } = await import('@vercel/blob');
    const r = await get(name, { access: 'private' });
    if (!r || r.statusCode !== 200) return null;
    return { buf: Buffer.from(await new Response(r.stream).arrayBuffer()), type: r.blob.contentType };
  },
  async delFile(name) {
    const { del } = await import('@vercel/blob');
    await del(name);
  },
};

const DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
let fileQueue = Promise.resolve();
let fileVersion = 0;
const local = (name) => path.join(DIR, name.replace(/[/\\]/g, '__'));
const fileBackend = {
  async read() {
    try {
      const text = await fs.readFile(local(DB), 'utf8');
      return { text, etag: String(fileVersion) };
    } catch { return null; }
  },
  // Lokal läuft nur ein Prozess: Schreiben nacheinander, Stand per Zähler vergleichen
  write(text, etag) {
    const job = fileQueue.then(async () => {
      await fs.mkdir(DIR, { recursive: true });
      const now = await fileBackend.read();
      if ((now ? now.etag : null) !== (etag || null)) throw new Conflict();
      await fs.writeFile(local(DB), text);
      fileVersion += 1;
    });
    fileQueue = job.catch(() => {});
    return job;
  },
  async putFile(name, buf, type) {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(local(name), buf);
    await fs.writeFile(local(name) + '.type', type);
  },
  async getFile(name) {
    try { return { buf: await fs.readFile(local(name)), type: await fs.readFile(local(name) + '.type', 'utf8') }; } catch { return null; }
  },
  async delFile(name) {
    await fs.rm(local(name), { force: true });
    await fs.rm(local(name) + '.type', { force: true });
  },
};

const backend = useBlob ? blobBackend : fileBackend;
export const { putFile, getFile, delFile } = backend;

// seed() liefert den Anfangszustand, falls noch keine Daten existieren
export async function read(seed) {
  for (let i = 0; i < 5; i++) {
    const cur = await backend.read();
    if (cur) return { db: JSON.parse(cur.text), etag: cur.etag };
    const db = await seed();
    try { await backend.write(JSON.stringify(db), null); } catch (e) { if (!(e instanceof Conflict)) throw e; }
  }
  throw new Error('store: kein Zugriff auf die Daten');
}

// Führt fn auf dem aktuellen Stand aus und speichert das Ergebnis.
// fn kann mehrmals laufen und darf ausserhalb von db nichts verändern.
export async function update(seed, fn) {
  for (let i = 0; i < 6; i++) {
    const { db, etag } = await read(seed);
    const result = await fn(db);
    await backup(db);
    try {
      await backend.write(JSON.stringify(db), etag);
      return result;
    } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      await new Promise((r) => setTimeout(r, 40 + Math.random() * 120 * (i + 1)));
    }
  }
  throw new Error('store: zu viele gleichzeitige Änderungen');
}

// Einmal pro Tag ein Stand als Sicherung, vor der ersten Änderung des Tages
async function backup(db) {
  const today = new Date().toISOString().slice(0, 10);
  if (db.lastBackup === today) return;
  const copy = JSON.stringify(db);
  db.lastBackup = today;
  await backend.putFile(`backups/${today}.json`, Buffer.from(copy), 'application/json');
}
