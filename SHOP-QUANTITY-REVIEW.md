# Sprachumschaltung und Mengenwahl – noch nicht veröffentlicht

Basis: `6ed42c6577b16e5b374fc1f70ab223a0db0a2b0a`.
Wiederherstellung: `backup/before-language-quantity-20260917`.

## Vorbereitete Änderungen

- Sichtbare DE/FR-Tasten, gespeicherte Sprachwahl, zusätzliche Shop- und Checkout-Übersetzungen; vorhandene Produktübersetzungen bleiben erhalten.
- Mengensteuerung im Konfigurator und Warenkorb, Positionssummen und Gesamtsummen, Zusammenfassen gleicher Konfigurationen. Größe, Farbbereiche, Wunschtext und Foto-Zuordnung unterscheiden Positionen.
- Bestehendes serverseitiges Limit von 20 Exemplaren je Konfiguration bleibt bestehen und wird angezeigt. Lagerbegrenzung zählt sämtliche Varianten eines Produkts zusammen.
- Kategorie-Karten umbrechen an Wortgrenzen und passen ihre Spaltenbreite an. Keine Änderungen an den bestehenden Farbdefinitionen oder Produktbildern.
- Cavallo zeigt wie die anderen Produkte ein unverändertes Beispielbild; Pferd und Sockel bleiben getrennt wählbar.
- Vorbereitete Anpassung in `supabase/product-options-order-compat.sql`: mehrere Exemplare derselben personalisierten Position dürfen dasselbe private Kundenfoto verwenden. Die Token-, Produkt-, Warenkorb- und Eigentumsprüfungen bleiben bestehen.

## Erfolgreich geprüft

Automatisierte DOM-Tests: Admin-Login und Ablehnung anderer Nutzer (simuliert), Erstellen/Bearbeiten/Löschen und Bild-Upload (simuliert), DE/FR-Tasten, Warenkorb und Checkout-Zusammenfassung, Mengen und Summen, identische sowie unterschiedliche Konfigurationen, Lagergrenzen, Pika/Cavallo, Frugo und Scheiben, Pflichtfoto, Text-Zuordnung und Upload-Fehlerbehandlung.

Server-Modultests mit simuliertem Storage: private Uploads, MIME-/Größenprüfung, keine öffentlichen Foto-URLs und Rate-Limits.

Reale Supabase-Leseprüfung: `customer-photos` und `product-models` sind privat. Anonyme und angemeldete Nicht-Admins können private Dateien nicht über `storage.objects` lesen oder auflisten; Kundenfoto-Metadaten sind ebenfalls geschützt. Keine RLS-/Storage-Änderung erforderlich. Der Sicherheitsprüfer meldet nur den bestehenden deaktivierten Schutz gegen kompromittierte Passwörter.

## Vor Veröffentlichung noch erforderlich

1. Zugängliche Vorschau für echte Desktop-/Mobilprüfung. Der bereitgestellte Browser blockiert localhost und lokale Dateien. Es wurde keine andere Browsersteuerung als Umgehung eingesetzt.
2. Vollständige visuelle DE/FR-Prüfung und echter Foto-Upload/Admin-Login in dieser Vorschau. Bisherige automatisierte Tests ersetzen diese nicht.
3. Vorbereitete SQL-Funktionsanpassung sicher anwenden und den erweiterten transaktionalen Test `supabase/test-product-options.sql` ausführen. Dieser prüft Menge 2 mit demselben Foto, Summen, Lager und Idempotenz und rollt Testdatensätze zurück. Die neue SQL-Version wurde noch nicht gegen die Live-Datenbank ausgeführt.
4. Erst danach Hauptbranch aktualisieren und GitHub Pages prüfen.

Die laufende Website, Produktdaten, Bilder, privaten Dateien und RLS-Regeln wurden in dieser Etappe nicht geändert.

Die bestehende Datenstruktur unterscheidet Lagerprodukte (`stock` numerisch) von Fertigung auf Bestellung (`stock = null`). Es gibt kein separates Nachbestellungskennzeichen. Daher wird ein Lagerprodukt bei `stock = 0` weiterhin nicht automatisch bestellbar gemacht. Eine automatische Umstellung von Scheiben auf Fertigung nach Abverkauf benötigt noch eine ausdrücklich definierte, serverseitig durchgesetzte Regel; Beschreibungstext wird dafür nicht als Sicherheitsregel interpretiert.
