# Google-Login in Verti — Ermittlungsstand & Übergabe (Stand 28.08.2026, abends)

> Kurz: Frische Google-Anmeldungen scheitern in Verti, weil Google **eingebettete** Browser
> aussperrt. Das ist keine Tarnungs-Frage und kein Verti-Bug, sondern eine Architektur-Grenze.
> Die früher offene Kernfrage „wie macht Shift das?" ist **beantwortet** (siehe unten).

## Das Problem
- **Sarah** kann sich in Verti **nicht frisch bei Google anmelden** (Google Drive, privates @gmail).
- Meldung: **„Anmeldung nicht möglich – Dieser Browser oder diese App ist unter Umständen nicht sicher."**, URL `…/signin/rejected?…rrk=46`.
- Abbruch **nach der E-Mail, VOR dem Passwort**. Betrifft **nur frische** Anmeldungen; **bestehende Sitzungen laufen weiter** (Freddy, Cindy, auch @gmail).
- Nicht versionsabhängig (Sarah ist auf 1.1.13).

## GEKLÄRT (28.08.2026): Warum Shift es kann und Verti nicht
**Shift Browser ist KEIN Electron, sondern ein echter Chromium-Browser.** Lokal am Code verifiziert:
- `/Applications/Shift Browser.app`, Bundle-ID `com.shift.browser`, Version **147.1.1.366**
- **Keine `app.asar`** (die hätte jede Electron-App), stattdessen `Shift Browser Framework.framework`
  mit echten Chromium-Bausteinen (`libEGL.dylib`, `libGLESv2.dylib`, `libvk_swiftshader.dylib`,
  `PrivacySandboxAttestationsPreloaded`, `libadblock.dylib`), 60 Sprachpakete
- Freddy hat sich am 28.08. in Shift live mit echtem @gmail angemeldet, Drive lief sofort.

Es gibt dort also **keinen Trick zum Abkupfern**. Shift kommt durch, weil es ein eigenständiger
Browser IST — genau wie Chrome oder Safari. Wavebox hat aus exakt diesem Grund 2019 Electron verlassen.

## Die eigentliche Trennlinie (wichtig, korrigiert)
Nicht „Chromium-Engine ja/nein", sondern **eigenständiger Browser vs. eingebettetes Web-Control
in einer Wirts-App**. Kronzeuge: **WebView2** ist die ECHTE Edge/Chromium-Engine mit vollständigen
Client-Hints — und wird von Google **trotzdem** blockiert
(MicrosoftEdge/WebView2Feedback #1647, offen seit 13.08.2021).
Auf der gesperrten Seite liegen **alle**: Electron, CEF (seit Jan 2020), WebView2, WKWebView.

## Was getestet wurde (`scripts/google-login-probe.js`)
| Ansatz | Fantasie-Adresse | Echtes Konto |
|---|---|---|
| **Firefox-Tarnung (Basis, = Stand 1.1.13)** | ✅ akzeptiert | ❌ abgelehnt |
| Firefox verstärkt (`productSub`/`oscpu`/`buildID` + `window.chrome` weg) | ✅ | ❌ |
| Firefox noch tiefer (+`deviceMemory`/`connection`/`webdriver`) | ❌ (verschlechtert!) | — |
| Volles echtes Chrome (Chrome-UA + `userAgentData` + `sec-ch-ua`) | ❌ sofort `rrk=46` | — |

## Warum Electron strukturell nicht durchkommt
- **Electron sendet die High-Entropy-Client-Hints gar nicht** (`sec-ch-ua-arch`,
  `-full-version`, `-platform-version`); `navigator.userAgentData.getHighEntropyValues()` bleibt leer.
  Electron-Issue **#34762 ist offen** (Stand 27.08.2026), es gibt kein Flag und keine API dafür.
- Header-Fälschen per `onBeforeSendHeaders` reicht nicht: ein JS-Gegencheck (Header vs. leere
  `userAgentData`) entlarvt den Widerspruch. Vertis Firefox-Tarnung hat sogar den umgekehrten
  Widerspruch (Firefox-UA, aber Chromium-APIs da) — selbst ein Bot-Signal.
- **OAuth ist kein Ausweg:** Der Zustimmungs-Bildschirm liegt hinter derselben Mauer, und ein
  erfolgreicher externer OAuth liefert nur **API-Token, keine Web-Sitzungs-Cookies** — Verti
  braucht aber die volle Web-Sitzung, weil es die echte Web-App einbettet.

## Warum Cookie-Übernahme aus einem echten Browser tot ist
- **DBSC** (Device Bound Session Credentials) bindet Google-Sitzungen an einen nicht
  exportierbaren Hardware-Schlüssel (Windows TPM / macOS Secure Enclave). Kopierte Cookies
  lassen sich in Electron **nicht erneuern** und sterben binnen Minuten.
  Windows: **GA und default-an seit Chrome 146 (Mai 2026), nicht abschaltbar.** macOS: im Finch-Rollout.
- Chrome 136 sperrt zusätzlich `--remote-debugging-port` am echten Profil (gezielt gegen Cookie-Diebstahl).
- Jede Extraktionsmethode (CDP, Keychain, Safari-binarycookies) ist exakt das, was Infostealer tun →
  für eine notarisierte App ein AV-/Vertrauens-Problem.
- **Einziger technischer Restweg:** Cookies aus **Firefox** (kennt kein DBSC) per `ses.cookies.set`
  in `persist:apps`. Fragil: Ritual pro Person, bricht bei Passwortwechsel/Challenge. Nicht getestet.

## Die Kosten-Realität eines eigenen Browsers (geprüft 28.08.2026)
- **Shift selbst hinkt hinterher:** installiert bei Freddy am 12.08.2026 mit **Chromium 147**
  (aus April 2026), während echtes Chrome bereits auf **152** stand. **5 Hauptversionen /
  ~4 Monate Rückstand bei den Sicherheits-Patches** — bei einer finanzierten Firma mit Team.
- **Chrome geht ab v153 (08.09.2026) auf einen 2-Wochen-Takt.** 2025 wurden **8 aktiv ausgenutzte
  0-Days** gepatcht, oft außer der Reihe.
- **Vivaldi** sagt selbst, man brauche „mindestens zwei volle Teams" allein für den Sicherheitszyklus;
  jede neue Chromium-Version zu integrieren dauert dort ~2 Wochen. Team-Größen: Brave ~340,
  Arc/TBC ~97, Vivaldi ~60, Wavebox 2–10 (und das ist deren einziges Produkt seit 2012).
- Erstbau realistisch 6–18 Personenmonate; **der Killer ist die Dauerwartung, nicht der Bau.**
- Klein sind dagegen: Widevine (kostenlos, via castLabs bereits vorhanden), Windows-Signing (~300–600 USD/Jahr).

## Wo der Code liegt
- **`main.js`**: `applyGoogleAuthDisguise(ses)` (Firefox-Header auf `accounts.google.com`),
  `firefoxUserAgent()`/`FIREFOX_UA`, `GOOGLE_AUTH_HOSTS`, `isGoogleAuthUrl()`,
  `viewWebPreferences()` (reicht Preload + UA an Views UND Login-Popups via `popupWindowOptions`).
- **`view-preload.js`**: `uaDisguise` setzt die JS-Kennung per `webFrame.executeJavaScript`.
- **`scripts/google-login-probe.js`**: Test-Sonde (nicht mitgepackt).

## Fallstricke (unbedingt beachten)
- **Rate-Limiting:** viele schnelle Versuche → Google lehnt pauschal ab. Vor sauberen Tests 1 h+ Ruhe.
- Die **Fantasie-Adresse** löst den Tiefen-Check NICHT aus; dafür braucht es eine **echte Gmail**
  (`EMAIL=echt@gmail.com npx electron scripts/google-login-probe.js`, tippt nur die E-Mail, nie ein Passwort).
- **NIE `wc.setUserAgent` aus Navigations-Events** (Ursache des Startabsturzes 1.0.15–1.0.17).

## Optionen (Stand jetzt)
1. **Fertigen Browser nutzen** (Wavebox/Shift/Vivaldi): löst Google **und** Spotify auf einen Schlag.
   Preis: Lizenz pro Sitz (~150–200 USD/Jahr), Verlust von IMPERIO-Branding und den Verti-Feinheiten
   (Titel-Badges, Stackfield-Favico-Hook, Maus-Seitentasten). **Vorher mit echtem Zielkonto gegentesten.**
2. **Verti bleibt Electron + Browser-Handoff:** frische Google-Anmeldung sauber in den Systembrowser
   auslagern, bestehende Sitzungen laufen weiter. Billig, haltbar, plattformübergreifend.
   Preis: Drive/Kalender für neue Konten nicht eingebettet.
3. **Eigener Chromium-Browser** (Freddys Wunsch): einziger Weg, der alles behält. Nur sinnvoll als
   **Rebrand einer bestehenden Basis** (ungoogled-chromium/Thorium, Brave-Modell: minimale,
   automatisiert eingewobene Patches) auf castLabs-ECS-Basis — nicht als Fork von Grund auf.
   Ehrliches Risiko: Sicherheits-Wartung im 2-Wochen-Takt, dauerhaft, allein.
4. **Firefox-Cookie-Helfer** als Notnagel für einzelne Konten (fragil, ungetestet).

## Billigste Experimente vor jeder teuren Weiche
- **(A) 1 Stunde:** Sonde mit **vollem Chrome-UA + allen `sec-ch-ua-*`** gegen ein echtes Konto.
  Bleibt `rrk=46` → Electron-Route endgültig begraben.
- **(B) 2–3 Tage:** Wavebox und Vivaldi mit dem echten IMPERIO-Zielkonto durchspielen
  (frischer Login, eingebettetes Drive, interne URLs, Badges, Spotify).
- **(C) 1–2 Wochen, nur falls A+B scheitern:** ungoogled-chromium/Thorium-Rebrand als Spike.

## Quellen
- Electron ohne High-Entropy-Client-Hints (offen): https://github.com/electron/electron/issues/34762
- WebView2 wird trotz echter Engine geblockt: https://github.com/MicrosoftEdge/WebView2Feedback/issues/1647
- Google sperrt eingebettete Browser: https://security.googleblog.com/2019/04/better-protection-against-man-in-middle.html , https://auth0.com/blog/google-blocks-oauth-requests-from-embedded-browsers/
- Chrome 2-Wochen-Takt ab v153: https://developer.chrome.com/blog/chrome-two-week-release
- Fork-Wartung (Vivaldi): https://yngve.vivaldi.net/sooo-you-say-you-want-to-maintain-a-chromium-fork/
- Wavebox Electron → Chromium: https://blog.wavebox.io/wavebox-is-evolving-electron-chromium/
- DBSC: https://workspaceupdates.googleblog.com/2026/05/prevent-account-takeovers-with-DBSC-now-generally-available-in-the-Chrome-browser-for-Windows.html
- Chrome 136 sperrt CDP am Default-Profil: https://developer.chrome.com/blog/remote-debugging-port
- Ferdium (gleiches Problem, ungelöst): https://github.com/ferdium/ferdium-app/issues/2324
