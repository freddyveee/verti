// electron-builder afterSign für castLabs ECS unter Windows (seit 1.0.21).
// Unter Windows muss die VMP-Signatur als LETZTER Schritt auf Verti.exe passieren:
// electron-builder bearbeitet die Exe nach afterPack noch (Icon/Metadaten per
// rcedit, optional Codesign), und jede Änderung macht eine vorherige VMP-
// Signatur ungültig (castLabs: Windows = VMP nach Codesign, macOS = davor).
// afterSign feuert nach dieser Bearbeitung und vor dem NSIS-Installer, der
// die Dateien nur noch einpackt. Idempotent: gültige Signatur → kein Upload.
const path = require('path');
const { flipFuses } = require('@electron/fuses');
const { vmpSign, ECS_FUSES } = require('./ecs-afterpack');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  // Erst die Schutzschalter, dann VMP - jede spaetere Aenderung an der Exe
  // macht die Signatur ungueltig (s. Kommentar in ecs-afterpack.js).
  if (process.platform !== 'darwin' || context.electronPlatformName === 'win32') {
    const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    console.log('[ecs-aftersign] Schutzschalter setzen:', exe);
    await flipFuses(exe, ECS_FUSES);
  }
  vmpSign(context.appOutDir);
};
