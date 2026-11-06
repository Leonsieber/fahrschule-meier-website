# Fahrschule Meier – Webseite

Öffentliche Seiten, Login, Schülerkonto, Verwaltung und Rechnungen. Läuft auf Vercel: Die Seiten sind statisch, `api/index.mjs` und `lib/` sind das Backend. Gebucht wird über `buchen.html` direkt per WhatsApp, Telefon oder E-Mail oder mit Konto über `login.html`.

## Daten

Alle Daten liegen als ein JSON-Dokument im privaten Vercel-Blob-Speicher (`db.json`), pro Tag entsteht unter `backups/` eine Sicherung. Änderungen werden nur geschrieben, wenn sich das Dokument seit dem Lesen nicht geändert hat.

Umgebungsvariablen auf Vercel: `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `BLOB_READ_WRITE_TOKEN`. Das Verwaltungs-Konto entsteht beim allerersten Start. Keine Passwörter ins Repository schreiben, es ist öffentlich.

## Lokal ansehen

```bash
npm install
node server.js
```

Danach http://localhost:5180 öffnen. Lokal liegen die Daten in `.data/`.

## Texte und Preise ändern

Als Verwaltung direkt auf der Webseite mit «Seite bearbeiten». Die Grundtexte stehen in `data/public.json`, getrennt nach Sprache (de, en, fr, it).

## Karte

`img/map.svg` basiert auf Daten von © OpenStreetMap-Mitwirkenden (ODbL).
