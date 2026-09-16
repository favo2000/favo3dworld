# Produktkatalog mit Supabase

Die statische Webseite lädt aktive Produkte aus `public."Products"` im Projekt
Favo3DWorld (`nxjowagpydwszicpcnjn`). Kein Build und keine zusätzliche Bibliothek nötig.

## Ablauf

`supabase-config.js` enthält Projekt-URL und den öffentlichen Publishable Key.
`products.js` ruft `/rest/v1/Products` mit `apikey`-Header, `active=eq.true` und
expliziter Spaltenauswahl ab. Der Browser meldet dabei keinen Benutzer an.
Supabase prüft die Rechte der Rolle `anon` und die vorhandenen RLS-Regeln.
Der Shop-Katalog verwendet keine Auth-Sitzung. Die getrennte Admin-Anmeldung
speichert ihre Sitzung nur im aktuellen Browser-Tab.
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
`model_url` wird nicht abgerufen. RLS beschränkt öffentliche Lesezugriffe auf aktive Produkte. Spaltenrechte
sperren model_url für öffentliche API-Abfragen; 3MF-Dateien gehören ausschliesslich
in den privaten Modell-Bucket.

Bei Ladefehlern erscheint ein Wiederholen-Button, ohne veraltete Demo-Produkte
anzuzeigen. Bei leerer Tabelle erscheint eine Leermeldung.
Live-Produkte werden über den geschützten Online-Admin gepflegt. Bestellungen werden durch `checkout.js` und die Edge Function `place-order` gespeichert.
Sondergrößen-Anfragen bleiben eine Demo. Details siehe `ORDERS.md`.

## Prüfung

Öffentlichen REST-Abruf mit dem Publishable Key prüfen; anschließend die Seite
über einen statischen HTTP-Server öffnen. Größen wechseln und Warenkorbpreise
vergleichen. Netzwerkfehler, leere Antwort, null-Preise, Bestand 0, französische
Beschreibung und neue Produkte ebenfalls prüfen.

Dokumentation: https://supabase.com/docs/guides/getting-started/api-keys

## Online-Admin

Über „Produkte verwalten“ mit dem bestehenden Supabase-Auth-Admin anmelden.
Nur das bereits eingerichtete Admin-Konto darf Daten schreiben (RLS).
Die Konto-Zuordnung bleibt in Supabase. Die Oberfläche fragt nur den
booleschen Status über `is_favo_admin()` ab.
`admin.js` verwendet den öffentlichen Schlüssel und die Benutzersitzung;
Passwörter werden nicht gespeichert. Die Sitzung liegt in sessionStorage und
endet beim Schliessen des Tabs oder durch „Abmelden“.

Name, Beschreibungen DE/FR, drei Grössenpreise, Bestand, Aktivstatus,
Farbmodus und Produktbild werden direkt in Products gepflegt. Leere Preise
bedeuten nicht angebotene Grössen, leerer Bestand bedeutet Print on Demand.
Die produktbezogenen Spezialkonfiguratoren sind anhand der bestehenden IDs
1–7 zugeordnet, damit eine Namensänderung die Konfiguration nicht verliert.
Neue Produkte erhalten automatisch eine ID und den allgemeinen Konfigurator.

Bilder: Bucket `product-images`, öffentlich abrufbar; nur der Admin kann
Dateien hochladen, ändern, auflisten oder löschen. JPG/PNG/WebP, max. 5 MB.
Neue Uploads erhalten eindeutige Dateinamen. Speichern aktualisiert die
Bild-URL und den Shop. Alte Bilder werden nicht automatisch entfernt, weil
sie noch referenziert sein können. Bei unklarem Netzwerkfehler nach Upload
bleibt die Datei erhalten; vor erneutem Speichern Liste aktualisieren.

Modelle: Bucket `product-models` ist privat, nur der Admin hat Zugriff.
Noch kein 3MF-Upload in der Oberfläche. Öffentliche Produktabfragen dürfen
`model_url` nicht lesen (Spaltenrechte); dort keine öffentlichen Modell-URLs
ablegen. Bestehende Produkte enthielten bei der Einrichtung keine Modell-URLs.
Inaktive Produkte sind durch RLS für Besucher gesperrt.

Die lokale Demo-Verwaltung wurde durch diese Online-Verwaltung ersetzt.
Alte lokale Demo-Daten wurden nicht gelöscht oder ungefragt übernommen.
Die Bibliothek `vendor/supabase-2.57.4.js` ist fest versioniert und lokal gebündelt.

### Prüfungen und Grenzen

RLS mit Admin- und Fremdbenutzer-Identitäten in einer zurückgerollten
Transaktion geprüft: Admin CRUD erlaubt, fremde Schreibzugriffe verweigert.
Öffentlicher REST-Katalog erfolgreich; öffentliche Modellspalten-Abfrage
und nicht angemeldeter Storage-Upload verweigert.
Echter Login mit dem bestehenden Admin-Konto, Bild-Upload und Preisänderung
wurden am 16.09.2026 über die veröffentlichte Oberfläche erfolgreich geprüft.
Die inaktiven Testprodukte wurden anschliessend entfernt. Das unreferenzierte
Testbild (vorhandenes Shop-Logo) bleibt im Bild-Bucket erhalten.

Automatisierte DOM-Tests mit simuliertem Supabase-Client: `npm ci && npm test`.
Deckt Login/Abweisung, CRUD, Upload, Katalog-Aktualisierung, Umbenennung,
Fehlerbehandlung und Abmeldung ab. Kein Ersatz für einen echten Login-Test.
