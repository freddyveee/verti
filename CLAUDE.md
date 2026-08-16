# Verti – Projektkontext

Verti ist Freddys selbstgebauter Shift-Ersatz: ein vertikaler Browser als Electron-Desktop-App. Web-Apps (Google Kalender, WhatsApp, Todoist, ChatGPT, Stackfield …) laufen als dauerhaft eingeloggte Views neben einer schmalen Sidebar. Wird intern bei IMPERIO genutzt; Mitarbeiter laden es über die Landingpage.

## Struktur

- `main.js` – Electron-Hauptprozess: Fenster, WebContentsViews, App-Katalog (`CATALOG`, `IMPERIO_IDS`), Fensterposition/State in `userData/window-state.json`, natives Menü, IPC
- `sidebar.html` – Renderer: Sidebar, App-Bibliothek (Bereiche "IMPERIO Apps" / "Weitere Apps"), Navigation, Drag-and-drop-Sortierung
- `preload.js` – contextBridge-API (`window.verti`)
- `icons/` – lokal eingebettete App-Logos (WhatsApp/Stackfield/Telegram, weil Favicon-Dienste dort versagen; Stackfield-Haken wurde manuell weiß gefüllt, war transparent ausgestanzt)
- `build/` – App-Icon (icon.png) und DMG-Hintergrund
- `docs/` – Landingpage (GitHub Pages): https://freddyveee.github.io/verti/

## Wichtige Entscheidungen

- User-Agent wird plattformabhängig auf Chrome gefälscht, sonst blockt Google-Login
- Session-Partition `persist:apps` hält alle Logins lokal
- Windows: eigener AppUserModelId, kein Strg+W-Close im Menü, titleBarOverlay statt Ampel-Buttons
- App ist unsigniert/nicht notarisiert → Gatekeeper/SmartScreen-Hinweise, Anleitung steht auf der Landingpage
- Auto-Update: beide Plattformen zeigen beim Öffnen einen Hinweis-Dialog mit den Release-Notes, der Nutzer bestätigt aktiv (Freddys Wunsch: nichts still im Hintergrund). Windows installiert danach per electron-updater über GitHub Releases (braucht `latest.yml` im Release!); Mac nur DMG-Download, weil unsigniert kein echtes Auto-Update kann
- Die `--notes` beim `gh release create` erscheinen im Update-Dialog der Nutzer → verständlich und auf Deutsch formulieren, Stichpunkte mit `-` werden als `•` angezeigt
- Ungelesen-Badges (ab 1.0.4): aus dem Seitentitel geparst ("(3) WhatsApp"). Bei Apps in `TITLE_BADGE_APPS` zählt die Zahl überall im Titel, bei allen anderen nur am Titelanfang (sonst falsche Badges durch Inhalts-Titel). Gesamtzahl am Dock-Icon (Mac) bzw. Taskleisten-Overlay (Windows). Stackfield meldet nichts im Titel → braucht ggf. später ein DOM-Skript

## Entwickeln

```bash
npm install
npm start
```

## Release (Ablauf)

1. Version in `package.json` erhöhen, auch den Versionstext in `docs/index.html` anpassen
2. Bauen: `npx electron-builder --mac --universal` und danach `npx electron-builder --win --x64` (getrennt ausführen, `--universal` bricht sonst den Windows-Build)
3. Veröffentlichen (WICHTIG: `latest.yml` mit hochladen, sonst bekommen Windows-Nutzer keine Auto-Updates):

   ```
   gh release create v1.0.x dist/Verti-Mac.dmg dist/Verti-Windows-Setup.exe dist/latest.yml --title "Verti 1.0.x" --notes "…"
   ```

4. Landingpage-Änderungen: einfach `git push` (GitHub Pages baut aus `docs/`, dauert 1–3 Min, Browser-Cache 10 Min beachten)

Die Download-Links der Landingpage zeigen immer auf `releases/latest`, müssen also nie angepasst werden. Der Release-Tag muss `v<version>` heißen (z.B. `v1.0.2`), der Mac-Update-Check liest ihn aus.

Regeln für jedes Release (sonst brechen Windows-Auto-Updates still):

- Nie ein Release ohne `Verti-Windows-Setup.exe` + `latest.yml` veröffentlichen, auch keinen Mac-only-Hotfix — der Windows-Updater schaut immer auf das neueste Release
- `latest.yml` und `Verti-Windows-Setup.exe` müssen aus demselben Build-Lauf stammen (sha512-Prüfung)

## Geräte-Sync (wichtig, immer befolgen)

Freddy arbeitet abwechselnd am MacBook und am Windows-PC. Deshalb:

- **Zu Beginn jeder Session:** ungefragt `git pull` ausführen, damit der Stand vom anderen Rechner da ist
- **Nach jeder abgeschlossenen Änderung:** committen und pushen, damit der andere Rechner nichts verpasst

## Hinweise zur Zusammenarbeit mit Freddy

- Kurze Antworten, keine langen Gedankenstriche im Fließtext
- Vor Weichenstellungen (Hosting, öffentlich/privat, Verteilwege) erst Optionen nennen und Freddy entscheiden lassen
- Auf Freddys Mac liegt gh unter /opt/homebrew/bin/gh (nicht im Terminal-PATH); Veröffentlichungs-Befehle führt Freddy selbst im Terminal aus
