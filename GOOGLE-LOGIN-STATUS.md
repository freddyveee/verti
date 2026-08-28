# Google-Login in Verti — GELÖST (28.08.2026)

> **Status: behoben und mit einem echten Konto bestätigt.** Ursache war NICHT Googles
> Sperre gegen eingebettete Browser, sondern Vertis eigener Preload-Code, der auf
> Googles Anmeldeseite mitlief. Fix in Commit `daab37e`.

## Das Problem (behoben)
- Frische Google-Anmeldungen scheiterten mit **„Anmeldung nicht möglich – Dieser Browser
  oder diese App ist unter Umständen nicht sicher"**, URL `…/signin/rejected?…rrk=46`.
- Abbruch **nach der E-Mail, VOR dem Passwort**. Bestehende Sitzungen liefen weiter.
- Aufgefallen bei **Sarah** (Google Drive, privates @gmail) auf 1.1.13.

## Die Ursache
Die Firefox-Tarnung war korrekt auf `accounts.google.com` beschränkt — **der übrige
Preload-Code aber nicht**. Auf Googles Anmeldeseite liefen deshalb zusätzlich:

| Skript | seit | überschreibt |
|---|---|---|
| Badge-Brücke | 22.08. 14:03 UTC (`dc0c65a`) | `window.Notification`, `ServiceWorkerRegistration.showNotification`, `window.Favico` |
| Autoplay-Riegel | 24.08. (`2e066a4`) | `HTMLMediaElement.prototype.play` |
| Stummschaltung | 25.08. (`c9bc3df`) | – |

Überschriebene Standard-Funktionen sind das klassische Erkennungsmerkmal für
manipulierte oder automatisierte Browser. Googles Anmeldeprüfung lehnt deshalb ab —
**unabhängig davon, wie gut die Tarnung ist.**

## Der forensische Nachweis
Cookie-Zeitstempel im Profil
(`~/Library/Application Support/Verti/Partitions/apps/Cookies`, Feld `creation_utc`):

| Zeit (UTC) | Ereignis |
|---|---|
| 22.08. 10:21 | Commit `d8edffa` „Google-Login repariert", Preload = **81 Zeilen, nur Tarnung** |
| 22.08. 10:45 | **Frische Anmeldung mit echtem Konto gelingt** (Cookies SID/HSID/SSID/APISID/SAPISID) |
| 22.08. 14:03 | Badge-Brücke kommt dazu → 155 Zeilen |
| 24.08. | Autoplay-Riegel kommt dazu |
| ab dann | frische Anmeldungen scheitern (Sarah, Sonde) |

## Der Fix (`daab37e`)
In `view-preload.js`: neu `ON_GOOGLE_AUTH` und `pageScript`. Auf Googles Anmeldehosts
läuft **nur** `uaDisguise`, überall sonst `mutedInit + autoplayGuard + bridge`.
Badges, Meldungen und Autoplay-Riegel in den Apps bleiben unverändert.

**Bestätigt:** Anmeldung mit Sarahs echtem @gmail in der Dev-Version durchgelaufen,
Google Kalender vollständig eingeloggt.

## Bekannte Einschränkung: Passkeys
Google bietet bei der Anmeldung teils einen **Passkey** an. Electron hat keinen
Plattform-Authentifikator (in der Sonde sichtbar als
`fido_discovery_factory.cc: Cannot use Bluetooth…`). Ausweg auf der Google-Seite:
**„Andere Option wählen" → Passwort**. Für den Support notiert.

## Lehren (wichtig für später)
1. **Neuer Preload-Code muss per Host begrenzt werden.** Alles, was Standard-Funktionen
   überschreibt, gehört von Googles Anmeldeseiten ferngehalten — sonst bricht es still
   den Login, ohne dass jemand den Zusammenhang sieht.
2. **„Es ging und ging dann nicht mehr" heißt: eigene Änderung, nicht Grundsatz-Sperre.**
   Zeitstempel (Cookies, Git-Log) schlagen jede Vermutung.
3. **Die Sonde war zeitweise ein untaugliches Messgerät** (Profil bei jedem Lauf gelöscht,
   Adresse per `insertText` auf einen Schlag ins Feld, ohne Maus und Tipprhythmus →
   eigenes Bot-Signal). Behoben: menschliches Tippen, optional `WARM=1` zum Aufwärmen.
   Sie kann trotzdem strenger urteilen als die echte App — **der aussagekräftigste Test
   ist die echte App mit einem echten Menschen.**

## Werkzeuge
```bash
# Verti mit frischem Testprofil (reproduziert den Fall eines neuen Mitarbeiters)
VERTI_USER_DATA=/tmp/verti-test npx electron .

# Sonde (tippt nur die E-Mail, nie ein Passwort; sparsam einsetzen, Google rate-limitet)
EMAIL=echt@gmail.com npx electron scripts/google-login-probe.js
WARM=1 KEEP_PROFILE=1 EMAIL=… npx electron scripts/google-login-probe.js
```
Auf Freddys Mac fehlt `npx` im Terminal-PATH → stattdessen
`/opt/homebrew/bin/node node_modules/electron/cli.js …`

## Wo der Code liegt
- **`main.js`**: `applyGoogleAuthDisguise(ses)` (Firefox-Header per `webRequest`),
  `firefoxUserAgent()`/`FIREFOX_UA`, `GOOGLE_AUTH_HOSTS`, `isGoogleAuthUrl()`,
  `viewWebPreferences()` (Preload + UA auch für Login-Popups via `popupWindowOptions`).
- **`view-preload.js`**: `ON_GOOGLE_AUTH`, `uaDisguise`, `pageScript`.
- **`scripts/google-login-probe.js`**: Sonde (wird nicht mitgepackt).

**MERKSATZ:** NIE `wc.setUserAgent` aus Navigations-Events aufrufen
(Ursache des Startabsturzes 1.0.15–1.0.17). Die JS-Kennung MUSS per
`webFrame.executeJavaScript` laufen (ein eingefügtes `<script>` verwirft Googles CSP still).

## Weiterhin gültiger Hintergrund
- Google sperrt eingebettete Browser grundsätzlich von der Anmeldung aus; die
  Firefox-Tarnung ist die Basis, auf der es überhaupt läuft.
- Cookie-Übernahme aus einem echten Browser bleibt tot (DBSC bindet Sitzungen an
  TPM/Secure Enclave; Windows GA seit Chrome 146/Mai 2026).
- „Shift Browser" ist ein echter Chromium-Fork (v147, keine `app.asar`), kein Electron —
  deshalb hat er das Problem nicht. Kein Trick zum Abkupfern.
