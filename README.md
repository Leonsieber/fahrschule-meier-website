# Fahrschule Meier – Webseite

Öffentliche Seiten, Login, Konto und Verwaltung als statisches Frontend. Auf GitHub Pages kommen die Texte aus `data/public.json`. Gebucht wird über `buchen.html` direkt per WhatsApp, Telefon oder E-Mail, oder mit Konto über `login.html`. Login, Konto und Verwaltung sind verlinkt, funktionieren aber erst mit dem Backend.

## Lokal ansehen

```bash
node server.js
```

Danach http://localhost:5180 öffnen. Konto und Verwaltung lassen sich mit Testdaten ansehen, mit `DEMO=student` oder `DEMO=admin` vor dem Befehl.

## Texte und Preise ändern

In `data/public.json`, getrennt nach Sprache (de, en, fr, it).

## Karte

`img/map.svg` basiert auf Daten von © OpenStreetMap-Mitwirkenden (ODbL).
