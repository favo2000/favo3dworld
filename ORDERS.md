# Bestellungen auf Rechnung

## Betrieb

Der Checkout speichert echte Bestellungen, löst aber keine Online-Zahlung aus.
Rechnungsstellung, E-Mail-Versand und die Admin-Oberfläche sind noch nicht implementiert.
Bestellungen können bereits im Supabase-Dashboard in `Orders` und `OrderItems` eingesehen werden.
Die vorhandene lokale Produktverwaltung ist kein angemeldeter Admin-Bereich.

`Orders`: Kundennamen, E-Mail, Lieferadresse (Land CH), Bestellnummer, UTC-Zeitstempel,
Status, Zahlung `Rechnung`, Währung CHF, Gesamtbetrag und interne Wiederholungskennung.
`OrderItems`: Produkt-ID, Name zum Bestellzeitpunkt, Größe, Farbcodes, Menge,
Einzelpreis und Positionsbetrag. Identische Konfigurationen werden zusammengefasst.
Farbcodes: primary/secondary für die vorhandenen Mehrfarbmodelle, primary für
Einfarbmodelle, leeres Objekt für Originalfarben/feste Scheiben. `fixed` bezeichnet
die feste Scheibengröße. Die Preise werden beim Bestellen aus Products gelesen.
Der Gesamtbetrag ist die Summe der Positionen; es wurden keine neuen Versandgebühren
oder Steuerberechnungen eingeführt.

## Sicherheit und Ablauf

Browser → `place-order` → `submit_invoice_order` → Orders/OrderItems.
Der Browser sendet die Auswahl, Kundendaten und den angezeigten Vergleichsbetrag.
Der Server prüft die Daten, berechnet alle Preise und lehnt Preisänderungen ab,
damit keine unbestätigten Mehrkosten entstehen. Nur aktive Produkte mit gültigen
Größen/Farben und Mengen 1–20 pro Konfiguration werden angenommen (max. 30 Positionen).

Die Edge Function akzeptiert ausschließlich POST/JSON mit dem öffentlichen Projekt-
API-Key und prüft Browser-Origin auf https://favo2000.github.io. Der Publishable Key
ist öffentlich und KEINE Kundenidentität. CORS ist ebenfalls kein Missbrauchsschutz.
`verify_jwt=false` ist für den Gastcheckout beabsichtigt; die API-Key-Prüfung erfolgt
im Funktionscode. Server-Schlüssel kommen ausschließlich aus den Supabase-Umgebungsvariablen.
Neue Secret Keys werden bevorzugt, mit Kompatibilitätsfallback auf den internen
Service-Role-Key. Kein privilegierter Schlüssel wird an den Browser weitergegeben.

RLS ist auf beiden Tabellen aktiviert. `anon` hat keine Tabellenrechte. Normale
angemeldete Benutzer erhalten durch RLS ebenfalls keine Zeilen und können nichts
ändern. Nur die bereits für Products berechtigte Admin-UID darf Bestellungen und
Positionen lesen sowie die Spalte `Orders.status` ändern. UPDATE hat USING und
WITH CHECK. Statuswerte: Neu, In Bearbeitung, Versendet, Abgeschlossen, Storniert.
Kundendaten, Beträge und Positionen sind über die Admin-API nicht editierbar.
Der Supabase-Dashboardbesitzer hat weiterhin administrative Datenbankrechte.

Die RPC ist SECURITY INVOKER und nur für service_role ausführbar. Es gibt keine
öffentlich aufrufbare SECURITY-DEFINER-Funktion und keinen Gast-Leseendpunkt.
Stock-Abzug, Bestellung und Positionen werden in einer Transaktion gespeichert.
Produktsperren verhindern Überverkauf, stabile Sperrreihenfolge vermeidet Deadlocks.
Bei `stock=null` bleibt Print on Demand unbegrenzt. Bei Stornierung wird Bestand
nicht automatisch zurückgebucht: das ist derzeit eine manuelle Admin-Aufgabe.

Zufällige Request-UUID + Payload-Hash verhindern doppelte Bestellungen bei
Wiederholungen. Gleiche UUID mit anderen Daten wird abgelehnt. Im Browser werden
nur UUID und Payload-Digest im sessionStorage gespeichert, keine Adresse/E-Mail.
Bei unklarer Netzwerkantwort bleibt der ursprüngliche Auftrag im Arbeitsspeicher
und wird unverändert wiederholt. Kunden sollen bei unklarer Antwort im offenen
Checkout erneut senden, statt die Seite zu schließen und einen neuen Auftrag zu beginnen.
Der Warenkorb wird erst nach bestätigtem Erfolg geleert.

Grundbegrenzung: max. 5 erfolgreiche Bestellungen pro Netzwerk-Digest/15 Minuten
und 3 pro E-Mail/Stunde; die Wiederholung einer bestehenden Bestellung zählt nicht.
Die Netzwerkadresse wird nur als HMAC-Digest gespeichert. Das ist ein Basisschutz,
kein CAPTCHA und kein vollständiger Schutz vor verteiltem Spam. Request-Größe max. 32 KiB.
Es gibt keine E-Mail-Verifizierung für Gastbestellungen.

## Dateien / Wiederherstellung

- `checkout.js`: Checkout und Wiederholungslogik.
- `index.html`: Ladeeinbindung, Bestellbutton und Statusmeldung im vorhandenen Design.
- `supabase/orders.sql`: angewendete Schema-/RLS-/Funktionsdefinition.
- `supabase/functions/place-order/index.ts`: deployed Edge Function ohne externe Pakete.
- `supabase/config.toml`: Gastcheckout-Konfiguration.
- `supabase/test-orders.sql`: Datenbanktests, vollständig mit ROLLBACK.

Die Migration `invoice_orders_secure_checkout` wurde über Supabase angewendet.
`orders.sql` ist eine Dokumentation dieser Migration, nicht zum wiederholten Ausführen.

## Verifiziert

- Echte öffentliche API: Bestellannahme und zwei gleichzeitige Requests → genau eine Bestellung.
- Rechnungsart, serverseitige Preise, gespeicherte Positionen, atomarer Lagerabzug.
- Falscher Preis/Zahlungsart, Überverkauf und veränderte Wiederholungsanfragen abgelehnt.
- Gastzugriff auf Tabellen und RPC über HTTP gesperrt.
- Normale Benutzer: keine fremden Zeilen, keine Statusänderung.
- Admin: Lesen und Statusänderung möglich, Preisänderung und ungültiger Status gesperrt.
- DOM-Checkout: Pflichtfelder, Mengen/Farben, Doppelklick, Wiederholung nach Fehler,
  Warenkorb erst nach Erfolg leeren, Bestellnummer anzeigen, keine Kundendaten im sessionStorage.
- Testdaten nach HTTP-Test entfernt; SQL-Tests mit ROLLBACK.

Die Admin-Sicherheitsprüfung meldete nur den bereits bestehenden Hinweis, dass
Supabase Auth den Schutz vor bekannten kompromittierten Passwörtern nicht aktiviert hat.
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
