# Machbarkeitsnachweis: Verti als Chromium-Erweiterung

Gemessen am 02.09.2026 mit dem selbst gebauten Chromium 155.

**Was hier drin ist:** Vertis Sidebar als Chrome-Erweiterung. Aussehen und
Farbwelten sind aus `sidebar.html` übernommen; statt `window.verti` (Electron)
laufen die Aktionen über `chrome.tabs`, `chrome.storage` und einen
Hintergrunddienst.

**Im echten Chromium nachgewiesen:**
- Erweiterung lädt ohne Fehler, Sidebar rendert, keine JS-Fehler
- Klick auf eine App öffnet sie als angehefteten Tab (bleibt geladen)
- Sechs Farbwelten und Hell/Dunkel funktionieren wie in Verti
- Ungelesen-Zahlen werden aus dem Seitentitel gelesen (dieselbe Regel wie
  in Vertis `main.js`) und als Zahl am Symbol angezeigt
- Der App-Katalog (209 Apps) wird 1:1 übernommen

**Start:**
```
Chromium --user-data-dir=<profil> --load-extension=spike-chromium
```

Nicht Teil des ausgelieferten Verti. Reiner Machbarkeitsnachweis.
