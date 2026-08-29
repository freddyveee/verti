# Verti Backlog

Hier sammeln wir Ideen und Wünsche. Umgesetzt wird laufend (Dev-Version, `npm start`), veröffentlicht wird gebündelt, sobald Freddy „jetzt bauen" sagt. Beim Release wandern die fertigen Punkte unter die neue Versionsnummer.

Nächstes Release: 1.1.15

## Offen

- Verti Browser – Stufe 3 (Stufen 1 und 2 sind fertig, s. unten): Chrome-Extensions – eigene „Erweiterungen"-Seite + Installieren/Aktualisieren aus dem Web Store (`session.loadExtension`); machbar (Shift macht es vor), Grenze ist nur die Kompatibilität einzelner Erweiterungen. (24.08.2026)
- Onboarding beim ersten Start (Shift-Stil, wird gerade anhand von Shift zusammengetragen): mehrstufiger Ersteinrichtungs-Assistent. Schritt 1: Bedingungen zustimmen + „Verti als Standardbrowser" + „Daten aus vorhandenem Browser importieren". Schritt 2: eigene Frage „Verti als Standardbrowser nutzen oder aktuellen Browser (Chrome/Safari) behalten?". Schritt 3: Apps auswählen und hinzufügen – nutzt Vertis vorhandenen App-Katalog; Vorschläge aus dem Browser-Verlauf, die meistgenutzten schon angehakt, „Ohne Apps überspringen" möglich. Abschluss: „Browser ist fertig"-Screen mit optionalem Konto/Sync (Spaces, Apps, Tabs, Lesezeichen, Verlauf geräteübergreifend; „Später erinnern"/„Jetzt syncen") – Login des Shift-Kontos läuft über Google/Apple/Microsoft als OAuth-Partner (nicht zu verwechseln mit eingebettetem Google-Login). Das Sync/Konto selbst ist unser zurückgestelltes Account-System, s. „Verschoben". (28.08.2026)

## Umgesetzt, noch nicht veröffentlicht

- Canva „Im Editor öffnen" riss ein zweites Fenster auf, statt in der Canva-Ansicht zu bleiben. Verti unterscheidet jetzt sauber, ob eine Seite wirklich ein eigenes Fenster will (echtes Popup, Login-Fenster, Formular-Versand) oder nur „mach das auf" meint – Letzteres öffnet in der bestehenden Ansicht. Betrifft alle Apps, nicht nur Canva. (29.08.2026)
- Entwicklerwerkzeuge unter „Ansicht" (Alt+Cmd+I bzw. Strg+Shift+I) für die gerade sichtbare App. Bisher gab es sie nirgends, dadurch war jeder Fehler innerhalb einer Web-App nur über eigens gebaute Sonden zu untersuchen. (29.08.2026)
- Apps im Hintergrund laufen jetzt ungebremst weiter. Verti versteckt immer alle Apps bis auf eine, und Chromium drosselt versteckte Seiten – dadurch konnten abgerissene Verbindungen sich nicht mehr selbst erholen. Bester Erklärungsansatz für den ChatGPT-Hänger (Enter schickt nichts mehr ab, Text bleibt im Feld stehen); hilft außerdem Badges und Benachrichtigungen im Hintergrund. **Noch nicht bewiesen – beobachten, ob der Hänger wiederkommt.** (29.08.2026)

## Blockiert

- (nichts)

## Ideen, noch nicht entschieden

- Symbol in der Mac-Menüleiste mit Ungelesen-Zahl und Schnellzugriff auf die Apps.
- Globales Tastenkürzel (z. B. Ctrl+Leertaste), das Verti aus jeder App heraus nach vorn holt und wieder wegschaltet.
- Windows: Schließen minimiert in die Taskleiste statt zu beenden.
- Mehrere Konten derselben App (zwei WhatsApp, zwei Google-Konten).
- Spaces/Profile (Shift-Stil): getrennte Bereiche mit je eigenen Apps und eigener Suche, beim Onboarding evtl. aus vorhandenen Browser-Profilen vorbefüllt. Achtung: importierte Profile liefern nur Name/Lesezeichen, KEINE eingeloggte Google-Sitzung (hängt am Google-Login-Problem, s. GOOGLE-LOGIN-STATUS.md). (28.08.2026)

## Verschoben / verworfen

- Wispr Flow als App: verworfen (23.08.2026). Es gibt keine Web-Oberfläche für Verlauf/Wörterbuch, nur Konto-, Admin- und API-Portale; das Diktieren funktioniert in Verti ohnehin systemweit.
- Account-System für App-Sync zwischen Geräten (wäre Supabase): verschoben, das Team nutzt je ein Gerät.
- Einklappbare Sidebar: als App-Feature verworfen, lebt nur als Demo auf der Landingpage.

## Veröffentlicht

### 1.1.14 (28.08.2026)

- **Google-Anmeldung repariert.** Neue Google-Konten ließen sich seit dem 22.08. nicht mehr anmelden („Dieser Browser oder diese App ist unter Umständen nicht sicher"). Ursache war nicht Google, sondern Verti selbst: Auf Googles Anmeldeseiten lief zusätzlicher Verti-Code mit (Badge-Brücke, Autoplay-Riegel, Stummschaltung), der Standard-Funktionen der Seite überschreibt – Google wertet das als manipulierten Browser. Dort läuft jetzt nur noch die Browser-Kennung, sonst nichts; in allen anderen Apps bleiben Badges, Meldungen und Autoplay-Riegel unverändert. Mit einem echten Konto gegengetestet: Anmeldung läuft durch, Google Kalender ist drin. (28.08.2026)
- Hinweis für den Support: Google fragt bei der Anmeldung teils nach einem **Passkey**, den Electron nicht kann. Ausweg auf der Google-Seite: „Andere Option wählen" → Passwort. (28.08.2026)

### 1.1.13 (28.08.2026)

- Der „Verbesserung"-Knopf funktioniert jetzt zuverlässig: Das Formular öffnete sich vorher unsichtbar hinter der geöffneten App und schien „tot". (28.08.2026)
- App-Icon war in kleinen Größen verpixelt/kaputt (auch das Icon der Installationsdatei) – jetzt scharfe, saubere Icons für Mac und Windows. (28.08.2026)
- Update-Hinweis: der Schatten des kleinen Popups läuft jetzt weich aus statt mit harter Kante. (28.08.2026)

### 1.1.12 (28.08.2026)

- Fehler behoben: Der neue „Verbesserung"-Knopf lag auf den Navigationspfeilen und ließ sich nicht anklicken. Er sitzt jetzt sauber oben rechts neben dem Zahnrad und öffnet das Formular zuverlässig. (28.08.2026)
- Updates werden jetzt wirklich erzwungen: Sobald ein Update bereitliegt und Verti im Vordergrund ist, dunkelt ein Pflicht-Popup die App ab, bis man aktualisiert – auch wenn Verti (wie auf dem Mac üblich) tagelang durchläuft. Vorher blieb es oft beim bloßen Update-Knopf. (28.08.2026)

### 1.1.10 (27.08.2026)

- Kein schwarzer/kaputter Bildschirm mehr nach dem Ruhezustand: Apps laden sich beim Aufwachen automatisch neu (die sichtbare sofort, die übrigen beim nächsten Öffnen). (27.08.2026)
- „Verbesserung"-Button oben in der Leiste: Mitarbeiter melden Wünsche direkt über ein kleines Popup-Formular (Thema + Vorschlag), landet bei Freddy im Admin-Panel. (27.08.2026)
- App-Bibliothek: „Mehr sehen" sitzt jetzt klar in der Kategorie-Überschrift („Alle N zeigen") und klappt sanft auf statt ruckartig. (27.08.2026)
- Update-Download-Cache wird beim Start aufgeräumt, damit sich keine alten Installer auf der Platte ansammeln. (27.08.2026)

### 1.1.9 (25.08.2026)

- App-Bibliothek: Suchfeld oben (filtert live über alle Kategorien) und je Kategorie erst 6 Apps, den Rest per Mehr-sehen-Button (Shift-Stil). (25.08.2026)
- App-Katalog massiv erweitert (nach Vorbild von Shift): 170 neue Apps, jetzt 214 in 16 Kategorien – KI, Kommunikation, Produktivität, Cloud-Speicher, Developer-Tools, Design, Arbeit & Business, Banking & Finanzen, Unterhaltung, Soziales, News & Wetter, Lernen, Shopping, Reise, Gesundheit & Fitness. Nischen-Apps weiter per eigener URL. (25.08.2026)
- App-Bibliothek nach Kategorien sortiert: IMPERIO, KI, Kommunikation, Produktivität, Google, Design & Entwicklung, Business, Unterhaltung, Soziales. Jede App gehört zu einer Kategorie; neue Kategorien (z. B. Banking) erscheinen automatisch, sobald eine App sie bekommt, selbst hinzugefügte Seiten landen unter „Weitere". (25.08.2026)
- Fehler behoben: Öffnet eine App ein neues Fenster/Tab zur selben App (z. B. ChatGPT „neue Unterhaltung"), bleibt es jetzt in Verti, statt im externen Browser aufzugehen. Echte externe Links gehen weiter in den Browser. (25.08.2026)
- Download-Ton: Bei fertigem Download spielt jetzt ein „Speicher"-Ton statt des Standard-Mitteilungstons (aktuell „Submarine", leicht änderbar). (25.08.2026)

### 1.1.8 (25.08.2026)

- IMPERIO Tools hat ein neues App-Logo (oranges I-Icon) – in der Sidebar und in der App-Bibliothek. (25.08.2026)
- Autodesk Fusion und Bambu Lab wieder aus dem Katalog entfernt: Fusion ist im Kern eine Desktop-App, und Bambu Lab war nur die Firmen-Webseite – beides bringt in Verti keinen Mehrwert. (25.08.2026)

### 1.1.7 (25.08.2026)

- Fehler behoben: Das Badge einer Titel-App (z. B. WhatsApp) konnte nach dem Öffnen verschwinden und kam nicht zurück. Jetzt zeigt Verti zuverlässig die echte Ungelesen-Zahl: am gerade offenen Icon ausgeblendet, im Hintergrund wieder sichtbar. (25.08.2026)
- Fehler behoben: Beim Installieren eines Updates konnte sich Verti aufhängen (eine Web-App blockierte mit einem Seite-verlassen-Dialog das Beenden). Verti ignoriert solche Blockaden jetzt, plus ein Sicherheitsnetz. (25.08.2026)
- Fehler behoben: Stackfield zeigte manchmal eine Phantom-1, obwohl nichts ungelesen war (ein reiner Favicon-Punkt wurde als 1 gezählt). Jetzt ergeben nur echte Zahlen ein Badge. (25.08.2026)
- Verti-Browser: die dunkle Leiste (Werkzeugleiste, Tabs, Adressfeld) ist einen Tick heller, damit sich der Browser klarer von dunklen Apps abhebt. (25.08.2026)

### 1.1.6 (25.08.2026)

- Einstellungen zeigen jetzt die installierte Versionsnummer und haben einen Knopf „Nach Updates suchen" (meldet: neueste Version, Update verfügbar oder Suche fehlgeschlagen; bei verfügbarem Update direkt „Jetzt aktualisieren"). (25.08.2026)
- Updates werden erzwungen: Steht beim Start ein Update bereit, blockiert ein Pflicht-Popup die Arbeit, bis aktualisiert wurde – kein „Später". Sicherer Notausgang: klappt das Update mal nicht (z. B. offline), gibt es „Erneut versuchen" und „Später weiterarbeiten" (beim nächsten Start fragt Verti wieder), niemand wird dauerhaft ausgesperrt. (25.08.2026)
- Benachrichtigungen pro App: In den Einstellungen lässt sich jede App einzeln stummschalten – dann kommen von ihr weder ein Badge noch Meldungen. (25.08.2026)

### 1.1.5 (24.08.2026)

- Kein Auto-Start von Medien mehr beim Öffnen: YouTube (und andere) spielen nach dem Neuöffnen von Verti nicht mehr von allein los, sondern erst nach einem Klick, wie in Chrome (autoplay-policy). (24.08.2026)
- Einstellungsseite (Grundgerüst): Zahnrad oben rechts öffnet die Einstellungen. Zwei Schalter – Darstellung (Dunkel bzw. helles Sandgrau; färbt Sidebar, Browser-Leiste und Dialoge um, die Web-Apps behalten ihr eigenes Design) und Externe Links (im Verti-Browser oder im System-Browser öffnen). Beides wird sofort gespeichert. (24.08.2026)
- Vier neue Apps im Katalog (unter Weitere Apps hinzufügbar): GetResponse, weclapp (CRM), Autodesk Fusion und Bambu Lab. (24.08.2026)
- Externe Links (z. B. aus WhatsApp) öffnen jetzt standardmäßig im Verti-Browser: das aktive Icon springt hoch zum Browser, der Link öffnet in einem neuen Tab. Die Umschaltung auf den System-Browser (Chrome/Safari) kommt mit der Einstellungsseite (Schalter schon im State: externalLinks). (24.08.2026)
- Verti Browser: Adressleiste mit Google-Vorschlägen und Verlauf – Dropdown wie in Chrome, das beim Tippen deinen Verlauf mit den Google-Autocomplete-Vorschlägen mischt (Pfeiltasten, Enter, Klick). (24.08.2026)
- Verti Browser: Verlauf – besuchte Seiten werden gemerkt und fließen in die Adressleisten-Vorschläge ein. (24.08.2026)
- Verti Browser: Leiste (Tabs, Adressleiste, Pfeile, Aktualisieren, Lesezeichen) 10 % größer für mehr Komfort. (24.08.2026)

### 1.1.4 (24.08.2026)

- Verti Browser sitzt fix oben in der Sidebar-Ecke, getrennt von den (weiter unten sortierbaren) Apps – auch bei nur wenigen Apps. Nicht verschiebbar, nicht entfernbar. (24.08.2026)
- Verti Browser (Stufe 2): Neuer-Tab-Seite mit Suchfeld (Logo + Suche), Ladebalken beim Laden, Chrome-Tastenkürzel (Cmd/Strg+T neuer Tab, +W Tab schließen, +L Adresse, +R neu laden), und offene Tabs werden gemerkt und nach dem Neustart wiederhergestellt. (24.08.2026)
- Verti Browser (Lesezeichen): Stern in der Adressleiste zum Merken/Entfernen, eigene Lesezeichenleiste unter der Adresszeile (erscheint automatisch, sobald Lesezeichen da sind); Klick öffnet, × entfernt. (24.08.2026)
- Verti Browser (Stufe 1): eigene, vorinstallierte Browser-App mit eigenem Logo (V + Weltkugel im Lila-Look). Echte Tabs (öffnen, schließen, wechseln), Adressleiste mit Web-Suche, Zurück/Vorwärts/Neu-laden – wie ein schlanker Chrome, im Verti-Dark-Look. (24.08.2026)

### 1.1.3 (23.08.2026)

- Zoom-Prozentanzeige: Beim Vergrößern/Verkleinern (Cmd +/−) erscheint kurz eine gläserne Prozentzahl mittig über der App (100 % = Originalgröße, 10-%-Schritte, 50–200 %), Cmd 0 zurück auf 100 %. Die Stufe wird je App gemerkt. (23.08.2026)
- Flackern behoben: Bei Musik an/aus (Spotify/YouTube) und bei Badge-Änderungen wurde die ganze Seitenleiste neu gezeichnet, wodurch Logos mit Online-Symbol (Google Kalender, Google Drive) kurz aufblitzten. Jetzt werden nur die betroffenen Zeichen (Equalizer, Badge) aktualisiert, die Icons bleiben stehen. (23.08.2026)

### 1.1.2 (23.08.2026)

- „Spielt gerade"-Zeichen in der Sidebar: Gibt eine App Ton aus (Spotify/YouTube im Hintergrund), erscheint ein gläserner Equalizer (Frosted Glass, das Logo schimmert durch) an der unteren Ecke des App-Icons, damit man sieht, woher die Musik kommt. (23.08.2026)
- Klick aufs Sidebar-Icon gibt der App sofort den Tastatur-Fokus: App-Tastenkürzel wie Leertaste (Play/Pause bei Spotify) wirken direkt, ohne erst ins Fenster zu klicken. (23.08.2026)

### 1.1.1 (23.08.2026)

- Rechtsklick-Menü in den Apps: Rechtschreibvorschläge und „Zum Wörterbuch hinzufügen", Rückgängig/Ausschneiden/Kopieren/Einfügen/Alles auswählen, „Link im Browser öffnen"/„Link kopieren", „Bild kopieren"/„Bild in Downloads sichern", „Neu laden". (23.08.2026)
- Letzte Seite pro App merken: Nach einem Neustart macht jede App dort weiter, wo man war; Anmeldeseiten und fremde Seiten werden nicht gemerkt, „Zur Startseite" führt zurück zur Startseite. (23.08.2026)
- Zoom pro App: Cmd +, Cmd −, Cmd 0 im Menü „Ansicht", Stufe wird je App gemerkt. (23.08.2026)
- Downloads landen ohne Nachfrage im Downloads-Ordner (bei gleichem Namen „(2)"), danach Mitteilung; Klick darauf zeigt die Datei im Finder. (23.08.2026)
- Spotify läuft in Verti: Umstieg auf castLabs' Electron mit Widevine-DRM und EVS-Produktionssignatur. Mac-Probe-Build spielt durch, Windows-Build signiert ebenfalls korrekt. Nutzer merken nur: Spotify spielt; beim ersten Start lädt die App einmal das DRM-Modul (10 MB) nach. (23.08.2026)
- Dev-Version ist als solche erkennbar: rotes Etikett „Dev-Version" neben dem Verti-Logo und Fenstertitel „Verti (Dev)", nur bei `npx electron .`, nie in der installierten App. (22.08.2026)
- Fehler behoben: Nach dem Start war kein App-Icon in der Sidebar als aktiv markiert (lila Balken kam erst nach dem ersten Klick), Wettlauf beim Laden. (22.08.2026)
- Sidebar-Sortierung wie auf dem iPhone: Das gezogene Icon hebt sich ab und folgt dem Zeiger, die anderen rutschen animiert in ihre neue Position, beim Loslassen gleitet es in die Lücke. (22.08.2026)
- Mac: Fenster schließen versteckt es nur noch, die Apps laufen weiter. Dock-Badge (Ungelesen-Zahl) und Benachrichtigungen kommen auch bei geschlossenem Fenster; Klick aufs Dock-Icon holt es zurück, Cmd+Q beendet. (22.08.2026)
- App-Bibliothek: Pfeil zurück und Home-Taste oben schließen die Bibliothek (bisher nur das ✕); auch Maus-Zurück, Cmd+[ und Cmd+Shift+H. Vorwärts ist in der Bibliothek aus. (22.08.2026)

### 1.0.20 (22.08.2026)

- Stackfield zeigt die Zahl ungelesener Benachrichtigungen als Badge in der Seitenleiste (Favico.js-Hook, exakt, sinkt beim Lesen).
- Maus-Seitentasten (Zurück/Vorwärts) funktionieren in allen Apps: echte Maustasten, Logitech-Wischgeste am Mac, Drei-Finger-Wischen am Trackpad, `app-command` unter Windows.
- Web-Benachrichtigungen per `showNotification` (Service-Worker-API), die Electron verschluckt hat, werden angezeigt; Klick auf eine Meldung holt Verti nach vorn und öffnet die App.

### 1.0.19 (22.08.2026)

- Google-Login repariert (Firefox-Tarnung per webFrame, Preload auch in Popups).
- Todoist startet in „Demnächst", Notion geht direkt in die App.
- Nur eine Verti-Instanz pro Profil (Single-Instance-Sperre).
