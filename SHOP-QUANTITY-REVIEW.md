# Sprachumschaltung und Mengenwahl – noch nicht veröffentlicht

Basis: `6ed42c6577b16e5b374fc1f70ab223a0db0a2b0a`.
Wiederherstellung: `backup/before-language-quantity-20260917`.

## Vorbereitete Änderungen

- Sichtbare DE/FR-Tasten, gespeicherte Sprachwahl, zusätzliche Shop- und Checkout-Übersetzungen; vorhandene Produktübersetzungen bleiben erhalten.
- Mengensteuerung im Konfigurator und Warenkorb, Positionssummen und Gesamtsummen, Zusammenfassen gleicher Konfigurationen. Größe, Farbbereiche, Wunschtext und Foto-Zuordnung unterscheiden Positionen.
- Bestehendes serverseitiges Limit von 20 Exemplaren je Konfiguration bleibt bestehen und wird angezeigt. Lagerbegrenzung zählt sämtliche Varianten eines Produkts zusammen.
- Kategorie-Karten umbrechen an Wortgrenzen und passen ihre Spaltenbreite an. Keine Änderungen an den bestehenden Farbdefinitionen oder Produktbildern.
- Cavallo zeigt wie die anderen Produkte ein unverändertes Beispielbild; Pferd und Sockel bleiben getrennt wählbar.
- Angewandte Anpassung in `supabase/product-options-order-compat.sql`: mehrere Exemplare derselben personalisierten Position dürfen dasselbe private Kundenfoto verwenden. Die Token-, Produkt-, Warenkorb- und Eigentumsprüfungen bleiben bestehen.
- Scheiben: bei positivem Bestand begrenzt der Shop die Gesamtmenge über alle Positionen. Bei Bestand 0 bleibt das Produkt als „Auf Bestellung“ / „Sur commande“ bestellbar. Nachproduktion reduziert den Bestand nicht unter 0. Wird Bestand nachgefüllt, gilt die Lagerbegrenzung wieder. Der Server fixiert den Modus nach der Produktsperre für den ganzen Auftrag, damit aufgeteilte Positionen die Grenze nicht umgehen.

## Erfolgreich geprüft

Automatisierte DOM-Tests: Admin-Login und Ablehnung anderer Nutzer (simuliert), Erstellen/Bearbeiten/Löschen und Bild-Upload (simuliert), DE/FR-Tasten, Warenkorb und Checkout-Zusammenfassung, Mengen und Summen, identische sowie unterschiedliche Konfigurationen, Lagergrenzen, Pika/Cavallo, Frugo und Scheiben, Pflichtfoto, Text-Zuordnung und Upload-Fehlerbehandlung.

Server-Modultests mit simuliertem Storage: private Uploads, MIME-/Größenprüfung, keine öffentlichen Foto-URLs und Rate-Limits.

Reale Supabase-Leseprüfung: `customer-photos` und `product-models` sind privat. Anonyme und angemeldete Nicht-Admins können private Dateien nicht über `storage.objects` lesen oder auflisten; Kundenfoto-Metadaten sind ebenfalls geschützt. Keine RLS-/Storage-Änderung erforderlich. Der Sicherheitsprüfer meldet nur den bestehenden deaktivierten Schutz gegen kompromittierte Passwörter.

## Datenbankanpassung angewandt und geprüft

Migration `allow_shared_photo_quantities_and_scheiben_made_to_order` wurde erfolgreich angewandt. Sie aktualisiert ausschließlich die bestehende Bestellfunktion. Die Änderung wurde gegen den zuvor ausgelesenen Funktionsstand abgesichert. Die Tests liefen bereits atomar in derselben Migration; Testdaten und Teständerungen wurden per Savepoint zurückgerollt. Anschließend bestand der eigenständige transaktionale Test erneut.

Geprüft: Foto-Menge 2 und Betrag 20 CHF, Foto-Zuordnung, abgelehnte falsche Token, Idempotenz ohne doppelte Lagerabbuchung; Scheiben mit positivem Bestand, Überschreitung über mehrere Positionen, Abverkauf auf 0, Nachproduktion mehrerer Exemplare bei 0, erneute Begrenzung nach Auffüllen. Prüfsummen sämtlicher Produktdaten und Storage-Objekte sind unverändert. Buckets und RLS-Policies sind identisch; die Bestellfunktion bleibt SECURITY INVOKER und nur serverseitig aufrufbar. Passwort-Leak-Protection wurde nicht verändert.

## Vor Veröffentlichung noch erforderlich

1. Zugängliche Vorschau für echte Desktop-/Mobilprüfung. Der bereitgestellte Browser blockiert localhost und lokale Dateien. Es wurde keine andere Browsersteuerung als Umgehung eingesetzt.
2. Vollständige visuelle DE/FR-Prüfung und echter Foto-Upload/Admin-Login in dieser Vorschau. Bisherige automatisierte Tests ersetzen diese nicht.
3. Erst nach Freigabe Hauptbranch aktualisieren und GitHub Pages prüfen.

Die laufende Website wurde nicht veröffentlicht oder verändert. Produktdaten, Bilder, private Dateien und RLS-Regeln bleiben unverändert; die oben beschriebene Serverfunktion ist bereits angepasst.

## Manuelle Abnahme, sobald eine Vorschau bereitsteht

Es gibt derzeit keinen veröffentlichten Vorschau-Link für diesen PR. Der erneute Browser-Versuch wurde mit `net::ERR_BLOCKED_BY_CLIENT` für die lokale Vorschau abgewiesen. Die bestehende GitHub-Pages-Seite enthält diese Frontend-Änderungen noch nicht und eignet sich daher nicht zur Abnahme des Entwurfs.

Jeweils Desktop und Mobil (etwa 390 und 320 Pixel), zuerst DE, dann FR:

1. DE/FR-Schalter betätigen, Kategorien öffnen, Produkt/Warenkorb öffnen und schließen, Seite neu laden: Sprache bleibt gewählt. Produktbeschreibungen, Größen, Farb- und Fotofelder sowie Checkout-Beschriftung folgen der Sprache. Farben und Design bleiben gleich.
2. Scheiben bei positivem Testbestand 5: feste Größe und CHF 10 prüfen; Menge 2 hinzufügen, noch einmal identisch hinzufügen: eine Position mit Menge 3, CHF 30. Mit Plus bis 5 erhöhen: CHF 50; weitere Erhöhung und zusätzliche Position müssen blockiert sein.
3. Scheiben bei Testbestand 0: „Auf Bestellung“ / „Sur commande“, Konfigurieren aktiv. Drei Exemplare hinzufügen: CHF 30; Menge im Warenkorb ändern. Nach Auffüllen des Testbestands muss die Grenze wieder gelten. Für diese Zustandswechsel eine getrennte Testdatenbank verwenden; keinen echten Lagerbestand nur für den Test verändern.
4. FIRE: ohne Foto darf Hinzufügen nicht funktionieren. Mit einem nichtpersönlichen Testfoto und Wunschtext zwei Exemplare hinzufügen. Eine Position zeigt Menge 2, Foto-Zuordnung, Text und den doppelten aktuellen Stückpreis. Menge im Warenkorb ändern; die Foto-Zuordnung bleibt gleich. Ein anderes Foto oder anderer Text muss eine getrennte Position ergeben.
5. Pika Urban: Körper/Hoodie getrennt wählen; Cavallo: Pferd/Sockel getrennt wählen; Frugo: ganze Modellfarbe. Unterschiedliche Farben oder Größen getrennt im Warenkorb, identische Auswahlen zusammengefasst. Bilder bleiben unverändert.
6. Kategorien einschließlich Hochzeit und saisonaler Kategorien: nur aktive Zuordnungen sichtbar, Filter korrekt, keine Wörter mitten im Wort getrennt und keine abgeschnittenen Karten.
7. Checkout öffnen und Summen, Mengen, Foto/Text und Übersetzungen prüfen. Keine echte Bestellung nur zum Test absenden; serverseitige Bestelltests sind bereits mit vollständigem Rollback durchgeführt.
8. Admin anmelden, vorhandene Daten nur ansehen; Erstellen/Bearbeiten/Löschen und Foto-Upload ausschließlich mit entbehrlichen Testprodukten in der Testumgebung prüfen. Keine realen Produkte oder Bilder für die Abnahme löschen.
