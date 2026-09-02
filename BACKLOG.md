# Verti Backlog

Hier sammeln wir Ideen und Wünsche. Umgesetzt wird laufend (Dev-Version, `npm start`), veröffentlicht wird gebündelt, sobald Freddy „jetzt bauen" sagt. Beim Release wandern die fertigen Punkte unter die neue Versionsnummer.

Nächstes Release: 1.1.19

## Offen

- **SICHERHEIT: Vertis Anmelde-Cookies liegen unverschlüsselt auf der Platte** (gemessen 02.09.2026: 556 von 557 im Klartext, 0 verschlüsselt). Ursache: Der Schlüsselbund-Eintrag „Verti Safe Storage" existiert nicht – er ging beim Test-Build-Zwischenfall am 23.08. verloren und kam nie zurück. Chromium fällt dann auf Klartext zurück. Wer Dateizugriff auf den Mac hat, kann alle Sitzungen mitnehmen. Für ein Produkt, das verkauft wird, muss das repariert werden. (02.09.2026)
- **Übernahme der Anmeldungen beim Chromium-Umstieg GEMESSEN: funktioniert, ist praktisch ein Dateikopieren.** Die Cookie-Tabellen von Electron-Verti und Chromium 155 sind strukturell identisch (20 Spalten, keine Abweichung). Test mit Freddys echtem Profil (auf einer Kopie): alle 557 Cookies überlebten, Chromium liest sie, sämtliche Google-Anmelde-Cookies (SID, HSID, SSID, APISID, SAPISID, __Secure-1PSID, LSID) sowie ChatGPT, Spotify und Stackfield sind vorhanden. **Niemand müsste sich neu anmelden.** Achtung: Das gilt nur, solange die Cookies unverschlüsselt sind – nach dem Sicherheitsfix oben braucht die Übernahme zusätzlich den Schlüssel. (02.09.2026)
- **Umbau-Aufwand GEMESSEN (02.09.2026): Vertis Sidebar läuft als Chromium-Erweiterung.** Von Vertis 49 Schnittstellen gibt es 30 (61 %) 1:1 als Chrome-Erweiterungs-API, 14 (28 %) baut man in der Erweiterung selbst nach, nur 5 (10 %) sind echte Handarbeit – das Dock-Badge und der Updater. Im selbst gebauten Chromium 155 nachgewiesen: Erweiterung lädt fehlerfrei, Klick auf eine App öffnet sie als angehefteten Tab, Farbwelten und Hell/Dunkel funktionieren, Ungelesen-Zahlen kommen aus dem Seitentitel. Code liegt in `spike-chromium/` (nicht Teil der Auslieferung). **`browser.html` und `view-preload.js` entfallen ersatzlos** (475 Zeilen), weil Chromium Tabs, Adressleiste und Google-Login selbst mitbringt. `sidebar.html` behält Aufbau und Aussehen, nur 65 Aufrufstellen werden umgeschrieben. (02.09.2026)
- **Chromium-Eigenbau GEMESSEN (02.09.2026): 4 Stunden 3 Minuten auf Freddys MacBook, komplett automatisch, 0 Fehler.** Aufteilung: Quelltext laden 19,5 Min (30 GB), Werkzeuge 7 Min, Vorbereitung 30 Sek, Übersetzen 3 Std 31 Min. Ergebnis: lauffähiges Chromium 155.0.8038.0, 691 MB (Chrome stable steht bei 152). Einzige Hürde war Apples fehlende Metal-Toolchain, mit `xcodebuild -downloadComponent MetalToolchain` in 2 Minuten behoben. **Damit ist meine frühere Schätzung „6–18 Personenmonate für den ersten Bau" widerlegt** – der Bau ist ein Nachtlauf. Offen und noch NICHT gemessen: der Umbau von Vertis Oberfläche auf Chromium (Sidebar, App-Ansichten, Badges, Stackfield-Favico-Hook, Maus-Seitentasten, Meldungs-Brücke) sowie Signierung, Notarisierung, Widevine und Updater. Das ist die eigentliche Arbeit. Bauumgebung liegt auf `/Volumes/VertiBuild` (APFS-Abbild auf der externen SSD). (02.09.2026)
- Verti Browser – Erweiterungen Stufe 2 (Stufe 1 ist umgesetzt): mitgelieferte, kuratierte Auswahl statt Chrome Web Store, plus eigene Symbolleiste und Popups. **Chrome Web Store ist bewusst raus** – Googles Bedingungen (Ziffer 4.4.2) untersagen den Bezug außerhalb ihrer Oberfläche, und die vorhandenen Hilfspakete sind ungepflegt, prüfen keine Signatur oder stehen unter GPL. **Harte Grenzen, die in die Erwartung müssen:** Passwortmanager (1Password, Bitwarden) laufen NIE, weil Electron die native Brücke sperrt. Klassisches uBlock Origin läuft nicht (chrome.webRequest ist in unserer Electron-Version kaputt), uBlock Origin Lite wahrscheinlich schon. Erweiterungs-Symbole und Badges muss Verti selbst zeichnen, chrome.action ist in Electron eine Attrappe. Bester Erstkandidat zum Testen: Dark Reader. (31.08.2026)

## Umgesetzt, noch nicht veröffentlicht

- Verti ist als Standard etwas heller (Dunkelmodus von #22242c auf #2a2c36 angehoben). (31.08.2026)
- Sechs Farbwelten zur Auswahl (Graphit, Marine, Wald, Kupfer, Pflaume, Rubin), wie bei Shift. Zu finden unter Einstellungen → Darstellung → Farbe und in der Browser-Seitenkarte. Jede Farbe hat einen dunklen und einen hellen Satz, passt also zu beiden Modi, und färbt Sidebar, Browser-Leiste und Fensterhintergrund gemeinsam. (31.08.2026)

## Blockiert

- (nichts)

## Ideen, noch nicht entschieden

- Störungsmeldungen: eigene Datenbank-Spalten für „geht im Browser" und App-Kennung statt sie in Thema/Beschreibung zu schreiben. Dann liesse sich im Admin-Panel danach filtern und die Upstream-Quote messen. (31.08.2026)

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

### 1.1.18 (31.08.2026)

- Bild-Großansichten funktionieren wieder: In ChatGPT (und überall sonst) ließ sich ein erzeugtes Bild nicht groß ansehen. Ursache waren zwei Fälle in der Fenster-Regel – eine `blob:`-Adresse trägt den Ursprung der Seite und hätte die App-Ansicht weggeblättert, eine `data:`-Adresse hat gar keinen Ursprung und wurde still verworfen. Beide öffnen jetzt ein eigenes Vorschau-Fenster, die App bleibt stehen. Mit zwei neuen Testfällen abgesichert und in der echten App gegengeprüft. (31.08.2026)
- Kompatibilitäts-Check um den Bereich „Bilder & Vorschau" erweitert (Overlay, `<dialog>`, Object-URL, neues Fenster per blob: und data:, Vollbild) – damit fällt genau diese Fehlerklasse künftig beim Vorab-Test auf. (31.08.2026)

### 1.1.17 (31.08.2026)

- Browser-Seitenkarte (Zahnrad in der Browser-Leiste, Vorbild Shifts „Quick Settings"): Neuer Tab, Erweiterungen, Downloads-Ordner öffnen, Verlauf löschen, alle Verti-Einstellungen und ein Hell/Dunkel-Schalter. Getrennt von den allgemeinen Einstellungen – vorher landete man beim Klick einfach dort. Das Puzzle steht jetzt nur noch für Erweiterungen, das Zahnrad für Einstellungen. (31.08.2026)
- Ersteinrichtung beim allerersten Start (vier Schritte, Shift-Vorbild): Willkommen, dann die Frage „Soll Verti dein Standardbrowser werden?" als eigener Schritt, dann Lesezeichen aus Chrome, Edge oder Brave übernehmen, dann Apps auswählen (IMPERIO-Apps schon angehakt, nach Kategorien sortiert, „Ohne Apps starten" möglich). Zum Schluss startet Verti mit der Auswahl neu. Überspringen jederzeit möglich. Importiert werden NUR Lesezeichen – Anmeldungen und Passwörter fasst Verti nicht an. (31.08.2026)
- App-Kennzeichnung in der Bibliothek: jede App zeigt „Geprüft" (mit Datum im Tooltip), „Unterstützt" oder „Experimentell". Die Stufe beschreibt UNSERE Zusage, nicht die Qualität der fremden App – kein Wettbewerber zeigt so etwas. Gepflegt wird die Liste in `app-status.json`, ohne Code-Änderung. Aktuell als geprüft eingetragen: Google Kalender, Google Drive, Canva, ChatGPT. **Freddy sollte die Liste erweitern, sobald er eine App wirklich durchgespielt hat** (anmelden, Kernfunktion, Badges). (31.08.2026)
- Störungsmeldung pro App: Rechtsklick auf ein Sidebar-Icon → „Diese App funktioniert nicht …". Das Formular ist mit dem App-Namen vorbelegt und stellt eine Pflichtfrage: „Geht es in deinem normalen Browser?" Diese eine Antwort trennt einen Verti-Fehler von einer Änderung beim App-Anbieter – ohne sie landet jede fremde Web-App-Änderung bei uns. Meldung geht wie bisher ins Admin-Panel. (31.08.2026)
- Kompatibilitäts-Check: eine Seite mit 25 Prüfpunkten, die alle Berührungsflächen zwischen Verti und beliebigen Web-Apps durchspielt (Fenster öffnen, Meldungen, Downloads, Medien, Anmeldung inkl. Passkeys, Zwischenablage, Darstellung, Meeting-Links). Zahnrad → Einstellungen → „Kompatibilität prüfen". Damit ist der Test vor einem Release ein einziger Seitenaufruf statt Handarbeit – besonders nach jedem Electron-Update. (31.08.2026)
- Die Fenster-Regel (öffnet sich etwas als Tab in der Ansicht oder als eigenes Fenster?) ist jetzt durch eine Testtabelle mit 16 Fällen abgesichert, `npm test`. Genau dort saß der Canva-Fehler. Dabei aufgefallen und behoben: das ausgelagerte Modul fehlte in der Paket-Liste, die gebaute App wäre nicht gestartet. (29.08.2026)

### 1.1.16 (29.08.2026)

- Rechtschreibprüfung spricht jetzt Deutsch. Vorher war sie zwar an, prüfte aber gegen Englisch – in jeder App standen rote Wellen unter korrektem Deutsch. (29.08.2026)
- Meeting- und Telefon-Links funktionieren: Zoom, Teams, Webex, Slack, Kalender-Abos, tel: und sms: wurden vorher still verworfen und passierten einfach nichts. (29.08.2026)
- Abgestürzte oder nicht geladene Apps laden sich jetzt einmal automatisch neu, statt weiß stehen zu bleiben, bis man es selbst merkt. (29.08.2026)
- Automatischer Katalog-Durchlauf (`scripts/catalog-sweep.js`): prüft alle 209 Apps in rund 15 Minuten und meldet, welche nicht mehr laden. Hat sofort Calendly (404) gefunden. Läuft nicht mit im Programm, ist ein Werkzeug für uns. (29.08.2026)
- Admin-Panel für die Verbesserungs-Meldungen ist jetzt aus Verti erreichbar: Zahnrad → Einstellungen → „Admin-Panel öffnen", geht im Verti-Browser auf. Nur auf Freddys Rechnern sichtbar. Einmal bei Supabase anmelden, danach bleibt die Anmeldung erhalten. (29.08.2026)
- Das Update-Fenster blieb liegen, wenn man Verti verschob – der dunkle Schleier war dann vom Fenster abgekoppelt. Es folgt jetzt beim Verschieben und beim Ändern der Größe. (29.08.2026)

### 1.1.15 (29.08.2026)

- Canva „Im Editor öffnen" riss ein zweites Fenster auf, statt in der Canva-Ansicht zu bleiben. Verti unterscheidet jetzt sauber, ob eine Seite wirklich ein eigenes Fenster will (echtes Popup, Login-Fenster, Formular-Versand) oder nur „mach das auf" meint – Letzteres öffnet in der bestehenden Ansicht. Betrifft alle Apps, nicht nur Canva. (29.08.2026)
- Entwicklerwerkzeuge unter „Ansicht" (Alt+Cmd+I bzw. Strg+Shift+I) für die gerade sichtbare App. Bisher gab es sie nirgends, dadurch war jeder Fehler innerhalb einer Web-App nur über eigens gebaute Sonden zu untersuchen. (29.08.2026)
- Apps im Hintergrund laufen jetzt ungebremst weiter. Verti versteckt immer alle Apps bis auf eine, und Chromium drosselt versteckte Seiten – dadurch konnten abgerissene Verbindungen sich nicht mehr selbst erholen. Bester Erklärungsansatz für den ChatGPT-Hänger (Enter schickt nichts mehr ab, Text bleibt im Feld stehen); hilft außerdem Badges und Benachrichtigungen im Hintergrund. **Noch nicht bewiesen – beobachten, ob der Hänger wiederkommt.** (29.08.2026)
- Calendly ließ sich nicht öffnen (Fehler 404) – die hinterlegte Adresse stimmte nicht mehr. Korrigiert. Gefunden vom neuen automatischen Katalog-Durchlauf. (29.08.2026)

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
