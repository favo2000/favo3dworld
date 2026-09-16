# GLB-Produktansicht

Unter **Produkte verwalten** anmelden, beim Produkt **Bearbeiten** wählen und unter **Öffentliche 3D-Ansicht (.glb)** eine Datei auswählen. **Produkt speichern** lädt sie hoch und ordnet sie zu. Zum Ersetzen eine neue GLB auswählen und erneut speichern. Ohne neue Datei bleibt die Zuordnung erhalten. **Gespeicherte 3D-Ansicht prüfen** öffnet die Vorschau.

- Binäres glTF 2.0 (.glb), maximal 25 MB; für Mobilgeräte möglichst unter 10 MB und mit wenigen Polygonen/komprimierten Texturen. Geometrie und Texturen müssen eingebettet sein; externe Dateiverweise werden abgelehnt.
- Der Shop zeigt weiterhin zuerst das Bild. Nur Produkte mit einer GLB erhalten **3D ansehen / Voir en 3D**. Ziehen dreht das Modell; Mausrad, Pinch-Geste oder die Plus-/Minus-Tasten zoomen. Die Vorschau verändert keine Konfigurator-Auswahl.
- GLBs im separaten öffentlichen Bucket `product-glb` sind öffentlich abrufbar. Deshalb dort ausschließlich dafür bestimmte Vorschaumodelle hochladen.
- Originale 3MF bleiben im privaten Bucket `product-models`. `model_url` wird weder abgefragt noch für Vorschauen verwendet. Bestehende Bilder und Modelle werden nicht gelöscht. Beim Ersetzen entsteht ein neuer GLB-Dateiname; die alte Datei bleibt erhalten.
- Der Bucket begrenzt MIME-Typ und Dateigröße, die Storage-Policy erlaubt Änderungen nur über die bestehende Admin-Prüfung. Die Datenbank erlaubt ausschließlich UUID-Dateinamen mit `.glb`. Die Inhaltsprüfung im Admin ist eine zusätzliche Prüfung; Storage prüft keine Dateisignatur. Nur das vertraute Admin-Konto darf hochladen.

## Technische Prüfung

`npm ci && npm test` prüft Admin-CRUD, Upload/Ersetzung, unveränderte Zuordnung ohne neue Datei, Ablehnung von 3MF/defekten GLB/externen Verweisen, Sprachwechsel, Fehlerbehandlung und Cavallo-/Pika-Konfiguratoren mit Warenkorb.

`node tests/glb-fixture.cjs /tmp/preview.glb` erzeugt ein unabhängiges Testmodell ohne Produktionsdaten. Die Seite `tests/3d-preview.html?model=<UUID>.glb` zeigt eine bereits hochgeladene Testdatei und ein 390-Pixel-Testfenster, ohne Produkte zu verändern. Native Touch-Gesten sollten zusätzlich auf einem echten Mobilgerät geprüft werden.

Die additive Supabase-Migration steht in `supabase/glb-preview-setup.sql`. Sie ist einmalig anzuwenden, bevor der neue Shop-Code veröffentlicht wird. Es werden keine bestehenden Policies oder Bucket-Einstellungen ersetzt.
