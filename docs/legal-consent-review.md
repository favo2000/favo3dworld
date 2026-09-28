# Rechtstexte und Foto-Einwilligungen — Entwurf, nicht veröffentlicht

Stand: 28.09.2026. Ausgangspunkt: veröffentlichter main-Stand `88802971e2b7c528f03c0792617a7423edd02916`.

## Sichtbare Änderungen

- Footer: AGB / Conditions générales, Datenschutzerklärung / Déclaration de confidentialité, Impressum / Mentions légales.
- Jeder Link öffnet einen schließbaren Dialog im bestehenden Stil. DE/FR nutzt die bestehende Sprachwahl. Warenkorb und Eingaben bleiben beim Lesen erhalten. Der Footer darf für die zusätzlichen Links auf schmalen Displays umbrechen.
- Foto-Produkte: zwei getrennte Checkboxen mit den gelieferten deutschen/französischen Texten. Beide sind zunächst leer. Die Verarbeitung muss vor dem Upload bestätigt werden. Die freiwillige Veröffentlichung betrifft Bilder des **fertiggestellten Produkts**, ist keine Bestellvoraussetzung und aktiviert keine automatische Veröffentlichung.
- Beim Austausch/Entfernen des Fotos werden beide Zustimmungen zurückgesetzt. Die Sprachumschaltung behält die aktuelle Auswahl bei. Produkte mit optionalem Foto bleiben ohne Foto und ohne Fotozustimmung bestellbar.
- Admin-Bestellpositionen mit Foto: „Foto-Einwilligungen prüfen“ zeigt beide Werte getrennt sowie Zeitpunkt, Textversion und Sprache. Altbestand: „Nicht dokumentiert“, keine nachträglich unterstellte Zustimmung. Der private Fotozugriff bleibt unverändert.

## Textquellen

Verwendet wurden ausschließlich die vier in diesem Gespräch hochgeladenen DOCX-Dateien:

1. `01_AGB_DE-FR_Favo3DWorld_bereinigt(1).docx`
2. `02_Datenschutz_DE-FR_Favo3DWorld_korrigiert(1).docx`
3. `03_Impressum_DE-FR_Favo3DWorld_bereinigt(1).docx`
4. `04_Foto-Einwilligungen_DE-FR_Favo3DWorld_bereinigt(1).docx`

Die DE-/FR-Absätze wurden unverändert übernommen und gegen die Originaldateien abgeglichen. Quellenname und SHA-256 stehen in `legal-content.js`. Dokument-Titel und redaktioneller Entwurfshinweis vor den Sprachabschnitten werden nicht als Shoptext angezeigt. Von der Foto-Vorlage werden die beiden Zustimmungstexte angezeigt, nicht der interne Umsetzungshinweis. Die Quellen werden nicht als DOCX im öffentlichen Repository abgelegt.

## Vorgesehene Speicherung (noch nicht live ausgeführt)

Die additive Migration ergänzt `CustomerPhotos` um:

| Feld | Bedeutung |
| --- | --- |
| `processing_consent` | notwendige Fotoverarbeitung, für neue Uploads zwingend true |
| `reference_consent` | unabhängige freiwillige Zustimmung, true oder false |
| `consent_version` | `2026-09-28`, zugehöriger Text im Git-Verlauf |
| `consent_language` | angezeigte Sprache de/fr |
| `consent_recorded_at` | serverseitiger Zeitpunkt |

Die neue service-only RPC validiert die Zustimmung und verwendet die vorhandene Reservierungsfunktion einschließlich Produktprüfung und Upload-Limit. Reservierung und Speicherung der Zustimmung sind atomar. Die Edge Function lehnt fehlende/ungültige Zustimmung **vor** Reservierung und Storage-Upload ab. Kunden erhalten weiterhin nur Foto-ID und Zuordnungstoken, keine öffentliche URL. Die bestehende `OrderItems.customer_photo_id`-Referenz verbindet die Zustimmung mit der Bestellposition; mehrere Exemplare desselben personalisierten Artikels verwenden weiterhin dieselbe Referenz.

Alte Datensätze bleiben unverändert und erhalten NULL-Werte. Vorhandene Warenkörbe/Bestellungen werden nicht nachträglich gesperrt. Die bestehende Reservierungs-RPC bleibt für die koordinierte Umstellung verfügbar, weiterhin ausschließlich mit Serverberechtigung. Kein neuer Gast-/Browserzugriff auf die Tabelle. Keine Änderungen an RLS, Storage-Buckets, 3MF-Dateien oder bestehenden Fotos.

## Technische Prüfungen

- `npm test`: bestehende Admin-, Produkt-/Mengen-/Lager-, Warenkorb-, Versand-, Sprach- und PayPal-Live/Sandbox-Tests mit lokalen DOM-/API-Mocks; zusätzliche Pflicht-/Optionalzustimmung, Dateiwechsel, Uploadfehler/Wiederholung, Datenschutzdialog ohne Eingabeverlust, getrennte Adminanzeige, DE/FR-Rechtstexte und Footerlinks.
- `npm run test:photo-db`: additive Migration auf isoliertem PostgreSQL/PGlite mit Schema-/Rollen-Fixture, Altdaten bleiben NULL, true/false getrennt, Zeitstempel, Pflichtvalidierung, unverändertes Upload-Limit, RPC nur für service_role, Gast-/Nichtadmin-Ablehnung, Admin ausschließlich lesend.
- Exakter Absatz- und SHA-256-Abgleich aller vier DOCX-Quellen.
- `git diff --check` und Prüfung des Änderungsumfangs. PayPal-, Preis-, Bestell-, Lager- und bestehende CSS-Dateien unverändert.

**Grenzen:** Die Supabase-Projektabfrage meldete `INACTIVE`; zwei SQL-Leseversuche endeten mit Verbindungs-Timeout. Deshalb keine Live-Schema-/RLS-/Storage-Validierung, keine Migration und kein Edge-Deployment. Der lokale PostgreSQL-Test ersetzt diese Live-Prüfung nicht. DOM-Tests bei 390/1440 px sind keine visuelle iPhone-/Desktop-Abnahme. Gemäß bestehender Vorgabe wurden keine erneuten blockierten Browser-Preview-Versuche gestartet. Keine echten Zahlungen oder Kundenbestellungen ausgelöst.

## Vor einer späteren Veröffentlichung noch erforderlich

1. Supabase muss wieder erreichbar sein. Tatsächliches `CustomerPhotos`-Schema, service-only Reservierungs-RPC, Admin-RLS und private Buckets mit dem Entwurf vergleichen. Bei Abweichungen stoppen.
2. Die additive Migration kontrolliert anwenden und echte Berechtigungs-/Storage-Tests durchführen, bevor Frontend/Edge veröffentlicht werden.
3. Edge Function und Frontend koordiniert aktualisieren. Ein noch geöffnetes altes Frontend sendet keine Einwilligungsheader und wird danach sicher abgewiesen; Kunden müssen neu laden. Alte Uploads werden nicht als nachträglich eingewilligt behandelt.
4. DE/FR-Dialoge und Fotoformular auf echtem Desktop/iPhone prüfen; kontrollierten neuen Testupload durchführen und beide gespeicherten Zustimmungen in der Admin-Bestellung prüfen.
5. Veröffentlichung erst nach gesonderter Freigabe. Keine Domainverbindung in diesem Auftrag. Die Erreichbarkeit der in den gelieferten Texten genannten Adresse `info@favo3dworld.ch` wurde nicht bestätigt.

## Unverändert / nicht ausgeführt

Keine Veröffentlichung, kein Merge in main, kein DNS-/Domain-Eingriff, keine produktive Migration/Edge-Änderung, keine Änderung an Farben, bestehenden Produkten, Größen, Preisen, Lager, PayPal, Versand oder privaten Dateien. TWINT/Payrexx nicht implementiert.
