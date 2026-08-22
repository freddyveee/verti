# Verti Backlog

Hier sammeln wir Ideen und Wünsche. Umgesetzt wird laufend (Dev-Version, `npm start`), veröffentlicht wird gebündelt, sobald Freddy „jetzt bauen" sagt. Beim Release wandern die fertigen Punkte unter die neue Versionsnummer.

## Offen

- (noch nichts – neue Ideen hier eintragen)

## Umgesetzt, noch nicht veröffentlicht

- Fehler behoben: Nach dem Start war kein App-Icon in der Sidebar als aktiv markiert (lila Balken kam erst nach dem ersten Klick), Wettlauf beim Laden. (22.08.2026)
- Sidebar-Sortierung wie auf dem iPhone: Das gezogene Icon hebt sich ab und folgt dem Zeiger, die anderen rutschen animiert in ihre neue Position, beim Loslassen gleitet es in die Lücke. (22.08.2026)
- Mac: Fenster schließen versteckt es nur noch, die Apps laufen weiter. Dock-Badge (Ungelesen-Zahl) und Benachrichtigungen kommen auch bei geschlossenem Fenster; Klick aufs Dock-Icon holt es zurück, Cmd+Q beendet. (22.08.2026)
- App-Bibliothek: Pfeil zurück und Home-Taste oben schließen die Bibliothek (bisher nur das ✕); auch Maus-Zurück, Cmd+[ und Cmd+Shift+H. Vorwärts ist in der Bibliothek aus. (22.08.2026)

## Blockiert

- Spotify (Widevine-DRM): braucht einen castLabs-EVS-Account (evs.castlabs.com), dann Fork mit VMP-Signierung und erneuter Test. Wartet auf Freddy.

## Verschoben / verworfen

- Account-System für App-Sync zwischen Geräten (wäre Supabase): verschoben, das Team nutzt je ein Gerät.
- Einklappbare Sidebar: als App-Feature verworfen, lebt nur als Demo auf der Landingpage.

## Veröffentlicht

### 1.0.20 (22.08.2026)

- Stackfield zeigt die Zahl ungelesener Benachrichtigungen als Badge in der Seitenleiste (Favico.js-Hook, exakt, sinkt beim Lesen).
- Maus-Seitentasten (Zurück/Vorwärts) funktionieren in allen Apps: echte Maustasten, Logitech-Wischgeste am Mac, Drei-Finger-Wischen am Trackpad, `app-command` unter Windows.
- Web-Benachrichtigungen per `showNotification` (Service-Worker-API), die Electron verschluckt hat, werden angezeigt; Klick auf eine Meldung holt Verti nach vorn und öffnet die App.

### 1.0.19 (22.08.2026)

- Google-Login repariert (Firefox-Tarnung per webFrame, Preload auch in Popups).
- Todoist startet in „Demnächst", Notion geht direkt in die App.
- Nur eine Verti-Instanz pro Profil (Single-Instance-Sperre).
