# QA-Checkliste Verti (vor jedem Release)

Vor jedem neuen Release einmal durchklicken. Verti ist eine Electron-Desktop-App für **Mac und Windows** –
Verhalten unterscheidet sich je Plattform, also möglichst auf beiden testen.

> Die Häkchen hakst du **bei jedem Release neu** ab. Wächst mit, wenn neue Funktionen dazukommen.

## Grundregeln
- **Die GEBAUTE/installierte App testen, nicht nur `npm start`.** Spotify (DRM), Signatur, Auto-Update und
  die castLabs-Signierung greifen nur in der gebauten App.
- Zum Testen ein eigenes Profil nehmen, um das echte nicht zu stören: `VERTI_USER_DATA=/tmp/verti-test npx electron .`
- Nach Änderungen an der Google-Anmeldung: mit `npx electron scripts/google-login-probe.js` gegenprüfen (sparsam, jeder Lauf ist ein echter Anmeldeversuch).

## Kernfunktionen
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

## Plattform / Release
- [ ] Mac: signiert & notarisiert, öffnet ohne Gatekeeper-Warnung
- [ ] Windows: SmartScreen-Hinweis ist erwartet (unsigniert) – Anleitung auf der Landingpage stimmt
- [ ] **Auto-Update:** beim Öffnen erscheint das lila Update-Popup mit den Release-Notes; bestätigen → installiert sauber (nur mit einem echten, neueren Release testbar)
- [ ] Release enthält **alle fünf Dateien** (Mac: `Verti-Mac.zip` + `latest-mac.yml` + `Verti-Mac.dmg`; Windows: `Verti-Windows-Setup.exe` + `latest.yml`), sonst brechen die Auto-Updates still
- [ ] Landingpage (docs/, GitHub Pages) lädt, Download-Links zeigen auf `releases/latest`, Versionstext aktuell

## Regelmäßig
- [ ] Vor größeren Releases die Kern-Flows auf **beiden** Plattformen durchgehen
- [ ] Bei neuen eingebundenen Web-Apps: Login, Badge und Benachrichtigung dieser App einmal prüfen

## Nach Änderungen an Fuses oder castLabs-Version

- [ ] `npx @electron/fuses read --app dist/mac-universal/Verti.app` → `EnableCookieEncryption is Enabled`
- [ ] Im Build-Log steht weiterhin `Signature is valid: streaming` (sonst spielt Spotify nicht)
- [ ] Spotify spielt in der GEBAUTEN App durch (nicht im Dev testen)
- [ ] Nach Anmeldung und Neustart: `sqlite3 <Profil>/Partitions/apps/Cookies "select sum(length(value)>0), sum(length(encrypted_value)>0) from cookies"` → erste Zahl 0, zweite > 0
- [ ] Auto-Update Mac UND Windows durchgespielt (asar-Integrität!)
- [ ] Windows: nach dem Update noch in allen Apps angemeldet
