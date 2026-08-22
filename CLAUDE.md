# Verti – Projektkontext

Verti ist Freddys selbstgebauter Shift-Ersatz: ein vertikaler Browser als Electron-Desktop-App. Web-Apps (Google Kalender, WhatsApp, Todoist, ChatGPT, Stackfield …) laufen als dauerhaft eingeloggte Views neben einer schmalen Sidebar. Wird intern bei IMPERIO genutzt; Mitarbeiter laden es über die Landingpage.

## Struktur

- `main.js` – Electron-Hauptprozess: Fenster, WebContentsViews, App-Katalog (`CATALOG`, `IMPERIO_IDS`), Fensterposition/State in `userData/window-state.json`, natives Menü, IPC
- `sidebar.html` – Renderer: Sidebar, App-Bibliothek (Bereiche "IMPERIO Apps" / "Weitere Apps"), Navigation, Drag-and-drop-Sortierung
- `preload.js` – contextBridge-API (`window.verti`)
- `view-preload.js` – Preload aller App-Views und Login-Popups: Firefox-Tarnung für Google-Anmeldeseiten (JS-Seite) + Brücke Seite→Verti für Badges (Notification, showNotification, Favico.js) und Klicks auf Meldungen
- `scripts/google-login-probe.js` – Sonde, die Googles Anmeldeseite mit Vertis Tarnung testet (siehe Entwickeln); wird nicht mitgepackt
- `scripts/mouse-probe.js` – Sonde, die im Fenster zeigt, was Maus-Seitentasten/Tastenkürzel im Hauptprozess auslösen (`npx electron scripts/mouse-probe.js`); wird nicht mitgepackt
- `icons/` – lokal eingebettete App-Logos (WhatsApp/Stackfield/Telegram, weil Favicon-Dienste dort versagen; Stackfield-Haken wurde manuell weiß gefüllt, war transparent ausgestanzt)
- `build/` – App-Icon (icon.png) und DMG-Hintergrund
- `docs/` – Landingpage (GitHub Pages): https://freddyveee.github.io/verti/
- `BACKLOG.md` – Ideen und Wünsche (Offen / Umgesetzt-ungebaut / Blockiert / Veröffentlicht). Jeden neuen Wunsch von Freddy sofort dort eintragen; Umsetzung laufend, Release gebündelt auf „jetzt bauen". Format: `- Text (TT.MM.JJJJ)`, Releases als `### 1.0.x (Datum)`
- `scripts/backlog-page.js` – baut aus `BACKLOG.md` die Checklisten-Seite: `node scripts/backlog-page.js .backlog-preview.html --full` für die Vorschau neben dem Chat (Datei ist gitignored, im Browser-Bereich öffnen) und ohne `--full` für das Artifact „Verti Backlog" (URL im Memory). Nach JEDER Änderung an BACKLOG.md beides neu ausspielen; wird nicht mitgepackt

## Wichtige Entscheidungen

- User-Agent wird plattformabhängig auf Chrome gefälscht (`chromeUserAgent()`); Electron schickt dabei keine Client-Hint-Header (`sec-ch-ua`)
- Google-Login (Stand 22.08.2026, mit `scripts/google-login-probe.js` gemessen): Google lehnt jeden Chrome-UA aus Electron ab („Dieser Browser oder diese App ist unter Umständen nicht sicher", URL `…/signin/rejected?…rrk=46`), auch mit voller Versionsnummer wie bei Ferdium. Durch kommt nur die Firefox-Tarnung auf `accounts.google.com`/`accounts.youtube.com`: Header per `webRequest` (`applyGoogleAuthDisguise`) + JS-Kennung per `view-preload.js`. Das Preload muss `webFrame.executeJavaScript` benutzen (ein eingefügtes `<script>` verwirft Googles CSP still) und auch Login-Popups mitgegeben werden (`popupWindowOptions` → `viewWebPreferences()`, Popups erben kein Preload). Nie `setUserAgent` aus Navigations-Events aufrufen (Startabsturz 1.0.15–1.0.17)
- Session-Partition `persist:apps` hält alle Logins lokal
- Electron ist seit 1.0.21 die castLabs-Variante „Electron for Content Security" (ECS, `github:castlabs/electron-releases#v43.2.0+wvcus`), damit Spotify (Widevine-DRM) läuft. Folgen: (1) `main.js` wartet beim Start auf `components.whenReady()` (Widevine-CDM, ~10 MB einmalig pro Profil); (2) `build/entitlements.mac.plist` braucht `com.apple.security.cs.disable-library-validation`, sonst lädt der CDM in der gepackten App nicht (dlopen-Fehler, Spotify schwarz/stumm); (3) `scripts/ecs-afterpack.js` entfernt beim Universal-Build die mitgelieferten `.sig`-Dateien der x64/arm64-Zwischenbauten und holt danach die VMP-Produktionssignatur bei castLabs EVS, auf dem Mac VOR dem Codesign, unter Windows nach dem Packen; (4) `electronDownload.mirror` zeigt auf die castLabs-Releases (ohne „v" am Ende). Entwicklungs-Signatur der castLabs-Builds reicht für Spotify NICHT, nur EVS-signierte Builds spielen. castLabs hinkt Electron ein paar Patch-Versionen hinterher; Updates über `npm install "https://github.com/castlabs/electron-releases#vX.Y.Z+wvcus" --save-dev` (Tags unter github.com/castlabs/electron-releases/releases). Keine Electron-Fuses konfigurieren, die brechen die VMP-Signatur
- Mac: Fenster schließen = verstecken (`win.on('close')` → `hide()`), damit die App-Views weiterlaufen und Dock-Badge/Benachrichtigungen auch bei geschlossenem Fenster ankommen; `quitting`-Flag (`before-quit`, vor `quitAndInstall`) lässt echtes Beenden durch. Windows: Schließen beendet weiterhin
- Windows: eigener AppUserModelId, kein Strg+W-Close im Menü, titleBarOverlay statt Ampel-Buttons
- Mac: signiert & notarisiert (ab 1.0.6, „Developer ID Application: Freddy Henrich-Held", Team CHS9G483R4). Zertifikat + privater Schlüssel liegen NUR in Freddys MacBook-Schlüsselbund (Backup in `~/Verti-Signing/`), Notar-Zugang als Keychain-Profil `verti-notary` → Mac-Builds gehen nur auf dem MacBook. Windows bleibt unsigniert → SmartScreen-Hinweis, Anleitung auf der Landingpage
- Auto-Update: beide Plattformen zeigen beim Öffnen ein lila Update-Popup (update.html) mit den Release-Notes, der Nutzer bestätigt aktiv (Freddys Wunsch: nichts still im Hintergrund). Danach installiert electron-updater über GitHub Releases — Windows braucht `latest.yml` + Setup.exe, Mac braucht `latest-mac.yml` + `Verti-Mac.zip` im Release. Hardened-Runtime-Entitlements + Mikrofon/Kamera-Texte stehen in `build/entitlements.mac.plist` bzw. `extendInfo` (behebt auch das ewige Mikrofon-Nachfragen der unsignierten Zeit)
- Die `--notes` beim `gh release create` erscheinen im Update-Dialog der Nutzer → verständlich und auf Deutsch formulieren, Stichpunkte mit `-` werden als `•` angezeigt
- Ungelesen-Badges (ab 1.0.4): aus dem Seitentitel geparst ("(3) WhatsApp"). Bei Apps in `TITLE_BADGE_APPS` zählt die Zahl überall im Titel, bei allen anderen nur am Titelanfang (sonst falsche Badges durch Inhalts-Titel). Gesamtzahl am Dock-Icon (Mac) bzw. Taskleisten-Overlay (Windows)
- Stackfield-Badge (ab 1.0.20, Code von Stackfield am 22.08.2026 aus dem Verti-Cache gelesen): Stackfield schreibt nichts in den Titel, zeigt die Ungelesen-Zahl aber per Favico.js im Favicon (`ShowPageTitle()` → `favicon.badge(n)`/`reset()`). `view-preload.js` fängt den `Favico`-Konstruktor ab und meldet die Zahl als `pageCounts` an main.js (exakt, sinkt beim Lesen, wird beim Öffnen nicht genullt). Native Stackfield-Meldungen kommen per `new Notification()` – aber nur, wenn im Stackfield-Profil „Desktop-Benachrichtigungen" an sind (Server-Einstellung; Stackfields Aktivierungs-Banner erscheint in Verti nie, weil Electron die Berechtigung von sich aus als „granted" meldet)
- Web-Benachrichtigungen allgemein: Electron zeigt klassische `new Notification()` nativ an, verwirft aber `ServiceWorkerRegistration.showNotification()` still (leere `DisplayPersistentNotification`) und kann kein Web-Push. Das Preload leitet `showNotification` aus der Seite auf die klassische API um (`actions` entfernt). Klick auf eine Meldung → Verti nach vorn + App umschalten (`verti-app-notify-click`)
- Maus-Seitentasten (ab 1.0.20): Drei Wege, alle über `mouseNav` (250-ms-Riegel gegen Doppelnavigation). (1) Echte Maustasten „back"/„forward": Chromium navigiert damit nur, wenn die Seite das mouseUp nicht verbraucht, deshalb fängt Verti sie per `before-mouse-event` + `preventDefault` VOR der Seite ab (`attachMouseNav`). (2) Mac mit Logi Options+: der Treiber schickt KEINE Maustaste, sondern eine Wischgeste → `win.on('swipe')`, „left" = zurück, „right" = vorwärts (mit `scripts/mouse-probe.js` gemessen; gilt auch für Drei-Finger-Wischen am Trackpad). (3) Windows: `app-command`. Bei Rätseln immer erst die Sonde laufen lassen statt raten

## Entwickeln

```bash
npm install
node node_modules/electron/install.js   # nur falls node_modules/electron/dist fehlt (npm führt Install-Skripte von GitHub-Paketen nicht automatisch aus)
npm start
```

EVS (castLabs-Signierdienst, nur zum Bauen nötig): Client einmalig `python3.11 -m pip install --user castlabs-evs` (Freddys Mac: Python 3.11 unter /opt/homebrew/opt/python@3.11/bin), Account `imperio` (Passwort in LastPass „castLabs EVS"). Das Zugangs-Token hält etwa einen Monat; meldet der Build „EVS_NO_ASK"/Token-Fehler, führt Freddy einmal `python3.11 -m castlabs_evs.account reauth` aus. Die Signatur der App selbst gilt ~4 Jahre und wird gecacht (unveränderte Binärdatei → kein neuer Upload). Nutzer merken von alldem nichts.

Testen mit eigenem Profil, ohne das echte Profil oder eine laufende Verti-Instanz zu stören (dev und installierte App teilen sich sonst `~/Library/Application Support/Verti`):

```bash
VERTI_USER_DATA=/tmp/verti-test npx electron .
```

Google-Login prüfen (tippt eine Fantasie-Adresse ein, kein Passwort nötig; sparsam einsetzen, jeder Lauf ist ein Anmeldeversuch bei Google):

```bash
npx electron scripts/google-login-probe.js
```

## Release (Ablauf)

1. Version in `package.json` erhöhen, auch den Versionstext in `docs/index.html` anpassen; in `BACKLOG.md` die Punkte aus „Umgesetzt, noch nicht veröffentlicht" unter die neue Version verschieben
2. Bauen (getrennt ausführen, `--universal` bricht sonst den Windows-Build; der Mac-Build holt die VMP-Signatur bei EVS (erster Upload ~380 MB), signiert + notarisiert automatisch, die Notarisierung bei Apple dauert oft 5–15 Minuten; im Log muss „Signature is valid: streaming" stehen):

   ```
   APPLE_KEYCHAIN_PROFILE=verti-notary npx electron-builder --mac --universal
   npx electron-builder --win --x64
   ```

3. Veröffentlichen (WICHTIG: alle FÜNF Dateien, sonst brechen Auto-Updates):

   ```
   gh release create v1.0.x dist/Verti-Mac.dmg dist/Verti-Mac.zip dist/latest-mac.yml dist/Verti-Windows-Setup.exe dist/latest.yml --title "Verti 1.0.x" --notes "…"
   ```

4. Landingpage-Änderungen: einfach `git push` (GitHub Pages baut aus `docs/`, dauert 1–3 Min, Browser-Cache 10 Min beachten)

Die Download-Links der Landingpage zeigen immer auf `releases/latest`, müssen also nie angepasst werden. Der Release-Tag muss `v<version>` heißen (z.B. `v1.0.2`), der Mac-Update-Check liest ihn aus.

Regeln für jedes Release (sonst brechen Auto-Updates still):

- Nie ein Release ohne die kompletten Plattform-Paare veröffentlichen: `Verti-Windows-Setup.exe` + `latest.yml` UND `Verti-Mac.zip` + `latest-mac.yml` — die Updater beider Plattformen schauen immer auf das neueste Release
- yml und zugehörige Binärdatei müssen aus demselben Build-Lauf stammen (sha512-Prüfung)
- Mac-Release nur vom MacBook aus bauen (Signatur-Zertifikat liegt nur dort)
- Mac-Build nur bei entsperrtem Mac starten: ist der Bildschirm gesperrt/im Ruhezustand, findet notarytool das Keychain-Profil nicht („No Keychain password item found") und die Notarisierung schlägt fehl

## Geräte-Sync (wichtig, immer befolgen)

Freddy arbeitet abwechselnd am MacBook und am Windows-PC. Deshalb:

- **Zu Beginn jeder Session:** ungefragt `git pull` ausführen, damit der Stand vom anderen Rechner da ist
- **Nach jeder abgeschlossenen Änderung:** committen und pushen, damit der andere Rechner nichts verpasst

## Hinweise zur Zusammenarbeit mit Freddy

- Kurze Antworten, keine langen Gedankenstriche im Fließtext
- Neue Wünsche landen immer in `BACKLOG.md` (Freddys Wunsch 22.08.2026), Releases werden gesammelt gebaut
- Vor Weichenstellungen (Hosting, öffentlich/privat, Verteilwege) erst Optionen nennen und Freddy entscheiden lassen
- Auf Freddys Mac liegt gh unter /opt/homebrew/bin/gh (nicht im Terminal-PATH); Veröffentlichungs-Befehle führt Freddy selbst im Terminal aus
