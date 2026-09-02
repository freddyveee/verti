const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

// Electron-Schutzschalter ("Fuses"). WICHTIG, frueher stand hier das Gegenteil:
// castLabs signiert seit ECS v35 GENAU EINEN festen Satz mit; Abweichungen
// lehnt EVS mit "Binary signature denied" ab. Der Satz enthaelt
// EnableCookieEncryption - ohne diesen Schalter speichert Chromium die
// Anmelde-Cookies im KLARTEXT auf die Platte (am 02.09.2026 gemessen:
// 556 von 557 Cookies unverschluesselt, waehrend Chrome 2742 von 2742
// verschluesselt). Signal Desktop und Bitwarden setzen den Schalter ebenfalls.
//
// Die Fuses muessen UNMITTELBAR VOR vmpSign umgelegt werden: jede spaetere
// Aenderung an der Binaerdatei macht die VMP-Signatur ungueltig. Deshalb NICHT
// build.electronFuses von electron-builder benutzen - das legt sie erst nach
// afterPack um und wuerde die Signatur still zerstoeren (Spotify waere tot).
const ECS_FUSES = {
  version: FuseVersion.V1,
  resetAdHocDarwinSignature: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
};

// electron-builder afterPack für castLabs ECS (Widevine/VMP, seit 1.0.21).
// macOS:
//  - x64/arm64-Zwischenbauten des Universal-Builds: mitgelieferte Entwicklungs-
//    .sig-Dateien entfernen, sonst scheitert das Zusammenführen („Expected all
//    non-binary files to have identical SHAs"), die Dateien unterscheiden sich je Architektur.
//  - Universal-Bundle: VMP-Produktionssignatur per castLabs EVS holen (sign-pkg auf dem
//    Verzeichnis mit der .app), VOR Apple-Codesign/Notarisierung (macOS-Reihenfolge).
// Windows: siehe scripts/ecs-aftersign.js (VMP muss NACH der Exe-Bearbeitung laufen).
// Voraussetzungen: pip-Paket castlabs-evs (Python 3.11) und ein angemeldeter
// EVS-Account (`python3.11 -m castlabs_evs.account reauth`, Token hält ~1 Monat).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ARCH = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function findSig(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findSig(p, out);
    else if (e.name.endsWith('.sig')) out.push(p);
  }
  return out;
}

function evsPython() {
  const candidates = [process.env.EVS_PYTHON, '/opt/homebrew/opt/python@3.11/bin/python3.11', '/opt/homebrew/bin/python3.11', '/usr/local/bin/python3.11', 'python3.11', 'python3'].filter(Boolean);
  for (const py of candidates) {
    try { execFileSync(py, ['-c', 'import castlabs_evs'], { stdio: 'ignore' }); return py; } catch {}
  }
  throw new Error('Kein Python mit castlabs_evs gefunden: python3.11 -m pip install --user castlabs-evs');
}

function vmpSign(dir) {
  const py = evsPython();
  console.log(`[ecs-afterpack] VMP-Signatur per EVS (${py}) für ${dir}`);
  const env = { ...process.env, EVS_NO_ASK: '1' }; // bei abgelaufenem Token Fehler statt Passwortabfrage
  execFileSync(py, ['-m', 'castlabs_evs.vmp', 'sign-pkg', dir], { stdio: 'inherit', env });
  execFileSync(py, ['-m', 'castlabs_evs.vmp', 'verify-pkg', dir], { stdio: 'inherit' });
}

exports.default = async function afterPack(context) {
  const arch = ARCH[context.arch] || String(context.arch);
  console.log(`[ecs-afterpack] ${context.electronPlatformName} ${arch} → ${context.appOutDir}`);
  if (context.electronPlatformName === 'darwin') {
    if (arch !== 'universal') {
      const sigs = findSig(context.appOutDir);
      for (const f of sigs) fs.unlinkSync(f);
      console.log(`[ecs-afterpack] ${sigs.length} .sig-Dateien entfernt (Zwischenbau ${arch})`);
      return;
    }
    const appPfad = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log('[ecs-afterpack] Schutzschalter setzen (inkl. Cookie-Verschluesselung):', appPfad);
    await flipFuses(appPfad, ECS_FUSES);
    vmpSign(context.appOutDir);
    return;
  }
  // Windows: NICHT hier. electron-builder bearbeitet Verti.exe nach afterPack noch
  // (Icon/Metadaten per rcedit, ggf. Codesign) und bricht damit jede vorher
  // gesetzte VMP-Signatur. Windows läuft deshalb in scripts/ecs-aftersign.js.
};
exports.vmpSign = vmpSign;
exports.ECS_FUSES = ECS_FUSES;
