# Design: Fahrschule Meier

Nach dem gebauten Stand beschrieben. Vorbild ist fahrschule-meier.ch: hell, persönlich, klare Unterseiten.

## Grundidee
Ein echter Fahrlehrer aus einer echten Gegend. Statt Stockbild zeigt die Startseite die Strassen des Einzugsgebiets (OpenStreetMap-Daten, als SVG selbst gezeichnet). Sobald ein Foto hochgeladen ist, ersetzt es die Karte und wird blau eingefärbt.

## Farbe
- Logo-Blau `#0074bc` als grosse Fläche (Startbild, Rechner, Abschluss, Login-Seite)
- Tiefblau `#005a93` für Hover und Text auf Weiss
- Weiss und kühles Hellgrau `#f0f4f7` im Wechsel als Abschnitte
- Logo-Schwarz `#231f20` für Text und Fusszeile
- Cyan nur im Logo

## Schrift
Barlow 400/500/600, selbst gehostet, normale Gross-/Kleinschreibung. Kein Versal-Kursiv und keine gesperrten Kleinzeilen über Titeln: das gehört dem Logo.

## Bausteine
- Knöpfe mit 6px Radius, Blau, Weiss auf Blau, Rand für Zweitaktion
- Preise als Zeilen mit grosser Zahl in Schweizer Schreibweise (90.– CHF), nicht als Karten
- Punktierte Linien für Abläufe, runde Symbole aus eigenem Strich-Set (`App.ICONS`)
- Blaue Wegweiser für Orte, Schweizer L-Schild als Marker auf der Karte
- Foto-Platzhalter: gestrichelte Fläche mit Bild-Symbol und Text, welches Foto hierhin kommt

## Bewegung
Einmalig: das L-Schild fährt beim Laden die Route ab. Sonst nur kurze Zustandswechsel, die Kopfzeile schrumpft beim Scrollen, die Linie im Ablauf füllt sich. `prefers-reduced-motion` zeigt den Endzustand.

## Handy
Gebucht wird ohne Konto auf `buchen.html`: Nachricht zusammenstellen und per WhatsApp, Telefon oder E-Mail schicken.

Ab 960px abwärts: Klappmenü, Karte über dem Text, Animation startet erst, wenn die Karte sichtbar ist, feste Leiste unten mit Anrufen, WhatsApp, Buchen.
