# Fahrschule Meier – Webseite

Öffentliche Seiten, Login, Konto und Verwaltung als statisches Frontend. Auf GitHub Pages kommen die Texte aus `data/public.json`. Gebucht wird ohne Konto über `buchen.html` (WhatsApp, Telefon, E-Mail). Login, Konto und Verwaltung brauchen das Backend und sind dort nicht verlinkt.

## Lokal ansehen

```bash
node server.js
```

Danach http://localhost:5180 öffnen. Konto und Verwaltung lassen sich mit Testdaten ansehen, mit `DEMO=student` oder `DEMO=admin` vor dem Befehl.

## Texte und Preise ändern

In `data/public.json`, getrennt nach Sprache (de, en, fr, it).

## Karte

`img/map.svg` basiert auf Daten von © OpenStreetMap-Mitwirkenden (ODbL).
