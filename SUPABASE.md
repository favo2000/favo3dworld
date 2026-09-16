# Produktkatalog mit Supabase

Die statische Webseite lädt aktive Produkte aus `public."Products"` im Projekt
Favo3DWorld (`nxjowagpydwszicpcnjn`). Kein Build und keine zusätzliche Bibliothek nötig.

## Ablauf

`supabase-config.js` enthält Projekt-URL und den öffentlichen Publishable Key.
`products.js` ruft `/rest/v1/Products` mit `apikey`-Header, `active=eq.true` und
expliziter Spaltenauswahl ab. Der Browser meldet dabei keinen Benutzer an.
Supabase prüft die Rechte der Rolle `anon` und die vorhandenen RLS-Regeln.
Es werden keine Auth-Sitzungen, Passwörter oder Benutzer-Tokens gespeichert.
Nie einen Secret- oder Service-Role-Schlüssel in diese Dateien eintragen.

Vorhandene HTML-Karten und Konfiguratoren werden anhand des Produktnamens
zugeordnet. Ihre Gestaltung und Farbabbildungen bleiben bestehen. Neue Namen
bekommen eine Karte mit dem allgemeinen Größen-/Einfarb-Konfigurator.
Für weitere spezielle Mehrfarb-Konfiguratoren ist eine eigene Zuordnung nötig.
`price_50`, `price_60`, `price_70` steuern Größenpreise; null bedeutet nicht verfügbar.
Scheiben verwendet `price_50` als Preis der festen Größe, ohne 50 cm anzuzeigen.
`stock=null` bedeutet Print on Demand, 0 ausverkauft, positive Werte Lagerbestand.
Der Warenkorb begrenzt die Menge pro Produkt auf den geladenen Bestand; das ist
keine serverseitige Reservierung. Alle Warenkorbpreise werden beim Hinzufügen
noch einmal aus dem geladenen Katalog übernommen.

`description_fr` wird beim französischen Sprachwechsel verwendet (Fallback DE).
Fehlende `image_url` nutzt das vorhandene Bild, neue Produkte das Logo als Ersatz.
`model_url` wird nicht abgerufen. Die bestehende öffentliche SELECT-Policy erlaubt
allerdings weiterhin API-Zugriff auf alle Zeilen/Spalten; die Spaltenauswahl im
Frontend ist kein Zugriffsschutz für Modell-URLs oder inaktive Datensätze.
RLS und Datenbankschema wurden nicht geändert.

Bei Ladefehlern erscheint ein Wiederholen-Button, ohne veraltete Demo-Produkte
anzuzeigen. Bei leerer Tabelle erscheint eine Leermeldung.
Die lokale Demo-Verwaltung bleibt getrennt und veröffentlicht keine Produkte.
Live-Produkte werden derzeit im Supabase-Dashboard gepflegt. Checkout und
Sondergrößen-Anfragen bleiben Demos; es werden keine Bestellungen übertragen.

## Prüfung

Öffentlichen REST-Abruf mit dem Publishable Key prüfen; anschließend die Seite
über einen statischen HTTP-Server öffnen. Größen wechseln und Warenkorbpreise
vergleichen. Netzwerkfehler, leere Antwort, null-Preise, Bestand 0, französische
Beschreibung und neue Produkte ebenfalls prüfen.

Dokumentation: https://supabase.com/docs/guides/getting-started/api-keys
