# Anfrage an castLabs — VMP-Signierung für ein selbstgebautes Chromium

Entwurf vom 09.09.2026. Auf Englisch, weil das bei castLabs der übliche Kanal
ist (GitHub, Support). Wohin: die Adresse aus dem EVS-Konto bzw. dem
LastPass-Eintrag „castLabs EVS"; alternativ ein Issue unter
github.com/castlabs/electron-releases (öffentlich). Bei kommerziellen
Konditionen eher E-Mail. Freddy schickt sie selbst.

**ABGESCHICKT am 02.10.2026** über das Kontaktformular auf castlabs.com/contact
(HubSpot, Bestätigung „Thanks for your message", submissionGuid
6ae4d1fd-0c30-43d6-92c5-55ce4b44ca5b). Absender freddy@imperio.rocks, Land leer,
„How did you find us" = Other, Newsletter NICHT angehakt. Antwort kommt an
freddy@imperio.rocks. Es gibt bei castLabs keine öffentliche Mailadresse.

---

**Subject:** VMP signing for a self-built Chromium (not Electron) — existing EVS account "imperio"

Hi castLabs team,

we use ECS (Electron for Content Security) for our internal desktop app and sign
our builds through EVS under the account **imperio**. Thanks for that — it has
worked reliably for us.

We are now moving the app off Electron onto a **self-built Chromium**, and we are
stuck on the platform (VMP) signature. Our question is simply whether you can
help with that, or whether we need a different route.

**Where we are technically**

* Chromium 155.0.8038.x, built from source, macOS arm64 (Windows will follow).
* GN args include `enable_widevine = true`, `proprietary_codecs = true`,
  `ffmpeg_branding = "Chrome"`.
* The Widevine CDM is provisioned at runtime by the component updater
  (4.10.3050.0, `_platform_specific/mac_arm64/libwidevinecdm.dylib`).
* EME works: `requestMediaKeySystemAccess('com.widevine.alpha', …)` resolves and
  `createMediaKeys()` succeeds. A real Widevine-protected test stream (Shaka
  demo asset, `cwip-shaka-proxy` license server) plays.
* Robustness levels match Google Chrome on the same machine
  (`SW_SECURE_CRYPTO` yes, `SW_SECURE_DECODE` no, `HW_SECURE_ALL` no).
* The app is Developer ID signed, notarized, hardened runtime; the utility
  helper carries `com.apple.security.cs.disable-library-validation` so the CDM
  can be loaded.

**What is missing**

Our build ships **no VMP signature files at all**. Google Chrome on the same
machine has `Google Chrome Framework.sig`; our bundle has none. Commercial
services behave accordingly — Spotify's web player starts a track, plays for a
few seconds and then stalls, which is the behaviour we know from unsigned
clients.

We also tried EVS directly, and it does not recognise a Chrome-style bundle:

```
python3 -m castlabs_evs.vmp verify-pkg /Applications/Verti.app
FileNotFoundError: No matching executable found in: /Applications/Verti.app
```

The same command fails identically on Google Chrome's own bundle, so this looks
like EVS being scoped to Electron packages rather than anything wrong on our
side.

**Our questions**

1. Can EVS sign a self-built Chromium (Chrome-style `.app` bundle with a
   versioned framework), today or as a paid service?
2. If not, what would you recommend? Is applying for our own Widevine licence
   with Google the realistic path for a company of our size, or is staying on
   ECS the only practical option for DRM playback?
3. Is there anything in between — e.g. keeping ECS for the media part only?

Happy to provide build details, entitlements or a test build.

Thanks a lot,
Freddy Henrich-Held
IMPERIO

---

## Antwort castLabs, 03.10.2026 (Flávio Viana Schroeder, Account Manager, flavio.viana@castlabs.com)

**Ja, sie können VMP-Signierung für ein selbstgebautes Chromium.** Weg: ihr
„Widevine certification service" statt EVS-Paketprüfung:

1. Code Audit: wir binden den Widevine-CDM nach ihrer Anleitung ein, ihre
   Ingenieure prüfen die Einbindung auf Widevine-Konformität.
2. Danach schalten sie den VMP-Signier-Ablauf für unseren App-Aufbau frei.

Infos: https://github.com/castlabs/electron-releases/wiki/EVS#3pl
Preise und Vertragsbedingungen erst nach NDA. Angehängt: MNDA
(`20251111_MNDA_Castlabs_GmbH.pdf`), nach Freigabe per DocuSign.
Nächster Schritt liegt bei Freddy (NDA prüfen/unterschreiben).

### MNDA durchgesehen (03.10.2026, keine Rechtsberatung)

2 Seiten, gegenseitig, deutsches Recht, Gerichtsstand Berlin, Laufzeit 2 Jahre
+ 2 Jahre Nachwirkung. Keine Vertragsstrafe, keine Exklusivität, kein
Abwerbeverbot, keine Pflicht zur Zusammenarbeit, keine Rechteübertragung
(Ziff. 12). Eigenentwicklung bleibt frei (Ziff. 4e). Einziger Punkt: welche
Firma unterschreibt. Abtretung nur mit Zustimmung (Ziff. 10) - wandert Verti
später in eine eigene Firma, braucht es castLabs' Zustimmung oder ein neues NDA.

### Stand 03.10.2026

Freddy: für den Eigengebrauch zu teuer, relevant erst beim Verkauf von Verti.
Er antwortet Flávio selbst aus dem IMPERIO-Postfach: „kommen darauf zurück,
sobald Verti kommerziell wird", mit Bitte um grobe Preisspanne. NDA NICHT
unterschrieben. Bis dahin bleibt Spotify in der Chromium-Fassung die Mac-App
(1.2.6).
