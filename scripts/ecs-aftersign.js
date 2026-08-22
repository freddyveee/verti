// electron-builder afterSign für castLabs ECS unter Windows (seit 1.0.21).
// Unter Windows muss die VMP-Signatur als LETZTER Schritt auf Verti.exe passieren:
// electron-builder bearbeitet die Exe nach afterPack noch (Icon/Metadaten per
// rcedit, optional Codesign), und jede Änderung macht eine vorherige VMP-
// Signatur ungültig (castLabs: Windows = VMP nach Codesign, macOS = davor).
// afterSign feuert nach dieser Bearbeitung und vor dem NSIS-Installer, der
// die Dateien nur noch einpackt. Idempotent: gültige Signatur → kein Upload.
const { vmpSign } = require('./ecs-afterpack');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  vmpSign(context.appOutDir);
};
