# Verti

Vertikaler Browser als Desktop-App (Electron): Google Kalender, WhatsApp, Todoist, ChatGPT, Stackfield und beliebige weitere Web-Apps in einer Sidebar.

**Download:** https://freddyveee.github.io/verti/

## Entwicklung

```bash
npm install
npm start
```

## Release bauen

```bash
npx electron-builder --mac --universal --win --x64
```

Ergebnis in `dist/`: `Verti-Mac.dmg` (universal) und `Verti-Windows-Setup.exe` (x64).

Neues Release veröffentlichen:

```bash
gh release create v1.0.x dist/Verti-Mac.dmg dist/Verti-Windows-Setup.exe --title "Verti 1.0.x" --notes "Änderungen…"
```

Die Landingpage (`docs/index.html`) verlinkt immer auf das neueste Release.
