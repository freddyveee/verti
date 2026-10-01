# Anfrage an castLabs — VMP-Signierung für ein selbstgebautes Chromium

Entwurf vom 09.09.2026. Auf Englisch, weil das bei castLabs der übliche Kanal
ist (GitHub, Support). Wohin: die Adresse aus dem EVS-Konto bzw. dem
LastPass-Eintrag „castLabs EVS"; alternativ ein Issue unter
github.com/castlabs/electron-releases (öffentlich). Bei kommerziellen
Konditionen eher E-Mail. Freddy schickt sie selbst.

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
