# QA-Checkliste Verti (vor jedem Release)

Vor jedem neuen Release einmal durchklicken. Verhalten unterscheidet sich je Plattform,
also möglichst auf **Mac und Windows** testen.

> Die Häkchen hakst du **bei jedem Release neu** ab. Wächst mit, wenn neue Funktionen dazukommen.

**Es gibt zurzeit zwei Fassungen.** Nimm den Abschnitt, der zu dem passt, was du baust:

| | Fassung | Stand |
|---|---|---|
| [Electron](#electron-fassung) | 1.1.x, das was das Team benutzt | veröffentlicht |
| [Chromium](#chromium-fassung) | 1.2.x, Vorab-Releases | im Umbau, siehe `CHROMIUM-STATUS.md` |

Solange beide leben, gilt: die Electron-Liste ist die verbindliche fürs Team,
die Chromium-Liste sammelt, was am Umbau noch nicht nachgewiesen ist.

## Chromium-Fassung

Angelegt am 08.09.2026, nachdem 1.2.3 stand. **Diese Liste ist noch nie ganz
durchgeklickt worden** – sie ist der eigentliche Prüfstand vor der Umstellung.

### Schon maschinell nachgewiesen (nicht von Hand nötig)

Diese Punkte sind mit echten Mausklicks bzw. echten Anfragen belegt, nicht nur
angenommen. Details in `CHROMIUM-STATUS.md`. Nach jedem Bau lassen sie sich
genauso wiederholen (`scripts/maus-sonde.swift`, `scripts/chromium-sonde.js`):

- [x] Zahnrad, Verbesserung, App-Bibliothek, Rechtsklick-Menü, Navigationspfeile reagieren auf echte Mausklicks
- [x] Fenster lässt sich an der Kopfzeile ziehen, Knöpfe darin bleiben trotzdem klickbar
- [x] Signiert, notarisiert, Gatekeeper `accepted / Notarized Developer ID`
- [x] Update-Kette komplett: Server antwortet, 233 MB geladen, CRX3-Signatur angenommen, App ausgetauscht, danach weiter notarisiert
- [x] Lila Update-Hinweis erscheint und zeigt die Release-Notes aus GitHub

### Von Hand prüfen, Riskantestes zuerst

- [ ] **Logins bleiben.** Alle Apps angemeldet? Verti schließen, neu öffnen, immer noch drin?
- [ ] **Google-Login.** Bei einer Google-App neu anmelden, kommt durch ohne „Browser nicht sicher". In Electron war das die fragilste Stelle; Chromium sollte es können, geprüft ist es nie worden
- [ ] **Spotify.** Spielt durch, springt nicht nach ~2 s weiter
- [ ] **Badges aus dem Titel.** WhatsApp/Telegram: ungelesene Nachricht erzeugt eine Zahl am Symbol, sinkt beim Lesen, keine Phantomzahl
- [ ] **Benachrichtigungen.** Native Meldung kommt an
- [ ] **Maus-Seitentasten** vor/zurück in einer App, kein Doppelsprung
- [ ] **Fenster schließen** (rotes Ampellicht): Apps laufen weiter, Meldungen kommen noch an, echtes Beenden übers Menü
- [ ] **Downloads und externe Links.** Datei landet im Downloads-Ordner, Link öffnet im Verti-Browser

### Vermutete Lücken

Hier wäre ein „geht nicht" keine Überraschung. Am 08.09.2026 im Quelltext
nachgesehen, aber nicht in der laufenden App gegengeprüft – wer eine davon
bestätigt oder widerlegt, trägt es hier ein:

- [ ] **Stackfield-Badge.** Der Favico-Haken saß in Electrons `view-preload.js`; `badge-content.js` fasst fremd bemalte Favicons absichtlich nicht an
- [ ] **Dock-Badge am Mac.** `sw.js` setzt die Zahl per `chrome.action.setBadgeText`, also am Erweiterungs-Symbol – und das zeigt Verti gar nicht
- [ ] **Klick auf eine Meldung** holt Verti nach vorn und schaltet zur App (kein Handler gefunden)
- [ ] **Zoom pro App**, **Onboarding**, **Kompatibilitäts-Check**
- [ ] **Admin-Zugang** (bekannt, steht in `BACKLOG.md`)
- [ ] **Update-Dialog** zeigt eine Adressleiste und bietet Herunterladen an, obwohl der Updater schon getauscht hat (beides in `BACKLOG.md`)

### Nach jedem Chromium-Release

- [ ] `chrome/VERSION` erhöht (`PATCH=`), sonst antwortet der Updater „kein Update"
- [ ] Release ist **Vorab** (`--prerelease`), `releases/latest` zeigt weiter auf die Electron-Fassung
- [ ] Alle **vier** Dateien im Release: DMG, `Verti-Mac.crx3`, `.sha256`, `.version`
- [ ] Nach Testläufen mit dem gebauten Binary die **installierte** App einmal öffnen – sonst zeigt der Updater auf die Bauplatte und die installierte Fassung bekommt nie wieder ein Update

## Electron-Fassung

Die Fassung, die das Team benutzt (1.1.x). Unverändert gültig, solange sie
ausgeliefert wird.

### Grundregeln
- **Die GEBAUTE/installierte App testen, nicht nur `npm start`.** Spotify (DRM), Signatur, Auto-Update und
  die castLabs-Signierung greifen nur in der gebauten App.
- Zum Testen ein eigenes Profil nehmen, um das echte nicht zu stören: `VERTI_USER_DATA=/tmp/verti-test npx electron .`
- Nach Änderungen an der Google-Anmeldung: mit `npx electron scripts/google-login-probe.js` gegenprüfen (sparsam, jeder Lauf ist ein echter Anmeldeversuch).

### Kernfunktionen
- [ ] App startet, Sidebar ist da, letzte Fenstergröße/Position wiederhergestellt
- [ ] App-Bibliothek: App aus „IMPERIO Apps" / „Weitere Apps" hinzufügen, öffnen, per Drag-and-drop sortieren, wieder entfernen
- [ ] Views laden: WhatsApp, Google Kalender, Todoist, ChatGPT, Stackfield öffnen sich und laden
- [ ] **Logins bleiben:** App schließen und neu öffnen → man ist überall noch eingeloggt (Partition `persist:apps`)
- [ ] **Google-Login** (fragil!): bei einer Google-App anmelden → kommt durch (Firefox-Tarnung), auch das Login-Popup. Keine „Browser nicht sicher"-Ablehnung
- [ ] **Spotify** (nur in der gebauten App): spielt durch, springt nicht nach ~2 s zum nächsten Song. Im Dev ist das erwartet kaputt (kein Bug)
- [ ] **Ungelesen-Badges:** WhatsApp/Telegram (Zahl im Titel) und Stackfield (Zahl im Favicon) erzeugen ein Badge; Gesamtzahl am Dock (Mac) bzw. Taskleisten-Overlay (Windows); sinkt beim Lesen; **keine Phantom-1** bei Stackfield ohne Ungelesenes
- [ ] **Benachrichtigungen:** native Meldung erscheint; Klick darauf → Verti kommt nach vorn und schaltet zur richtigen App
- [ ] **Maus-Navigation zurück/vorwärts:** echte Seitentasten; am Mac Logi-Options+/Trackpad-Wisch links/rechts; unter Windows die App-Command-Tasten. Kein Doppelsprung
- [ ] **Fensterverhalten:** Mac – Fenster schließen versteckt nur (Views laufen weiter, Badges/Meldungen kommen), echtes Beenden übers Menü. Windows – Schließen beendet die App

### Plattform / Release
- [ ] Mac: signiert & notarisiert, öffnet ohne Gatekeeper-Warnung
- [ ] Windows: SmartScreen-Hinweis ist erwartet (unsigniert) – Anleitung auf der Landingpage stimmt
- [ ] **Auto-Update:** beim Öffnen erscheint das lila Update-Popup mit den Release-Notes; bestätigen → installiert sauber (nur mit einem echten, neueren Release testbar)
- [ ] Release enthält **alle fünf Dateien** (Mac: `Verti-Mac.zip` + `latest-mac.yml` + `Verti-Mac.dmg`; Windows: `Verti-Windows-Setup.exe` + `latest.yml`), sonst brechen die Auto-Updates still
- [ ] Landingpage (docs/, GitHub Pages) lädt, Download-Links zeigen auf `releases/latest`, Versionstext aktuell

### Regelmäßig
- [ ] Vor größeren Releases die Kern-Flows auf **beiden** Plattformen durchgehen
- [ ] Bei neuen eingebundenen Web-Apps: Login, Badge und Benachrichtigung dieser App einmal prüfen

### Nach Änderungen an Fuses oder castLabs-Version

- [ ] `npx @electron/fuses read --app dist/mac-universal/Verti.app` → `EnableCookieEncryption is Enabled`
- [ ] Im Build-Log steht weiterhin `Signature is valid: streaming` (sonst spielt Spotify nicht)
- [ ] Spotify spielt in der GEBAUTEN App durch (nicht im Dev testen)
- [ ] Nach Anmeldung und Neustart: `sqlite3 <Profil>/Partitions/apps/Cookies "select sum(length(value)>0), sum(length(encrypted_value)>0) from cookies"` → erste Zahl 0, zweite > 0
- [ ] Auto-Update Mac UND Windows durchgespielt (asar-Integrität!)
- [ ] Windows: nach dem Update noch in allen Apps angemeldet
