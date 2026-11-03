// Testtabelle fuer die Fenster-Regel (window-policy.js).
// Laeuft OHNE Electron:  node scripts/test-window-policy.js
//
// Hintergrund: Der Canva-Fehler vom 29.08.2026 (ein Tab-Wunsch riss ein
// zweites Fenster auf) waere hier in Sekunden aufgefallen. Jede Aenderung an
// der Regel muss diese Tabelle weiter bestehen.
const test = require('node:test');
const assert = require('node:assert');
const { wantsRealWindow, makeWindowOpenPolicy } = require('../window-policy');

// --- Stubs statt Electron ---
const AUTH = ['accounts.google.com', 'auth.openai.com', 'appleid.apple.com'];
const INSTALLIERT = ['web.whatsapp.com', 'chatgpt.com'];
const host = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };

function baueRegel(openerUrl = 'https://www.canva.com/projects', eigeneApp = 'www.canva.com') {
  const geoeffnet = { extern: [], geladen: [] };
  const policy = makeWindowOpenPolicy({
    isAuthUrl: (u) => !u || u === 'about:blank' || AUTH.includes(host(u)),
    isInstalledAppUrl: (u) => INSTALLIERT.includes(host(u)),
    isOwnAppUrl: (u, wc) => !!wc.eigeneApp && host(u) === wc.eigeneApp,
    popupWindowOptions: (w, h) => ({ width: w, height: h }),
    browserOpenExternal: (u) => geoeffnet.extern.push(u),
    log: null,
  });
  const opener = {
    getURL: () => openerUrl,
    eigeneApp,
    loadURL: (u) => geoeffnet.geladen.push(u),
  };
  return { entscheide: policy(opener), geoeffnet };
}

// [Name, details, erwartete Aktion, erwartete Breite oder null, wohin]
const FAELLE = [
  // --- gleiche App: Tab-Wunsch bleibt IN der Ansicht (der Canva-Fall) ---
  ['Canva Editor per target=_blank', { url: 'https://www.canva.com/design/ABC/edit', disposition: 'foreground-tab' }, 'deny', null, 'geladen'],
  ['Canva Editor, disposition default', { url: 'https://www.canva.com/design/ABC/edit', disposition: 'default' }, 'deny', null, 'geladen'],
  ['Canva Hintergrund-Tab', { url: 'https://www.canva.com/design/ABC/edit', disposition: 'background-tab' }, 'deny', null, 'geladen'],
  // --- Canva 03.11.2026: noopener ist kein Fenster-Wunsch ---
  ['Canva Projekt mit noopener', { url: 'https://www.canva.com/design/ABC/edit', disposition: 'foreground-tab', features: 'noopener' }, 'deny', null, 'geladen'],
  ['Canva Projekt mit noopener,noreferrer', { url: 'https://www.canva.com/design/ABC/edit', disposition: 'foreground-tab', features: 'noopener, noreferrer' }, 'deny', null, 'geladen'],
  ['noopener mit Massen bleibt Fenster', { url: 'https://www.canva.com/x', disposition: 'foreground-tab', features: 'noopener,width=500' }, 'allow', 1100, null],
  // --- gleiche App: echtes Popup bekommt ein Fenster ---
  ['gleiche App als Skript-Popup', { url: 'https://www.canva.com/x', disposition: 'new-window' }, 'allow', 1100, null],
  ['gleiche App mit Fenstermassen', { url: 'https://www.canva.com/x', disposition: 'foreground-tab', features: 'width=500,height=600' }, 'allow', 1100, null],
  ['gleiche App per POST', { url: 'https://www.canva.com/x', disposition: 'foreground-tab', postBody: { data: 'x' } }, 'allow', 1100, null],
  // --- Anmeldung: Popup bleibt Popup, Link laedt in der Ansicht ---
  ['Google-Login als Skript-Popup', { url: 'https://accounts.google.com/o/oauth2/auth', disposition: 'new-window' }, 'allow', 520, null],
  ['leeres OAuth-Popup', { url: 'about:blank', disposition: 'new-window' }, 'allow', 520, null],
  ['OAuth ohne URL', { url: '', disposition: 'foreground-tab' }, 'allow', 520, null],
  ['Login-Link (target=_blank)', { url: 'https://accounts.google.com/signin', disposition: 'foreground-tab' }, 'deny', null, 'geladen'],
  ['Apple-Login mit Massen', { url: 'https://appleid.apple.com/auth', disposition: 'foreground-tab', features: 'width=400' }, 'allow', 520, null],
  // --- Bild-Vorschauen (blob:/data:) - der ChatGPT-Fall vom 31.08.2026 ---
  // Ein Bild in der Grossansicht darf NIE die App-Ansicht wegnavigieren und
  // erst recht nicht still verschluckt werden.
  ['Bild als blob: aus der App', { url: 'blob:https://www.canva.com/abc-123', disposition: 'foreground-tab' }, 'allow', 1100, null],
  ['Bild als data:', { url: 'data:image/png;base64,iVBORw0KGgo=', disposition: 'foreground-tab' }, 'allow', 1100, null],
  ['Bild als blob: per Skript-Popup', { url: 'blob:https://www.canva.com/x', disposition: 'new-window' }, 'allow', 1100, null],
  // --- fremde Seite: ab in den Browser ---
  ['fremder Link', { url: 'https://example.com/artikel', disposition: 'foreground-tab' }, 'deny', null, 'extern'],
  ['fremdes Skript-Popup', { url: 'https://example.com/x', disposition: 'new-window' }, 'deny', null, 'extern'],
  // --- andere installierte App: eigenes Fenster nur als echtes Popup ---
  ['andere App als Skript-Popup', { url: 'https://web.whatsapp.com/', disposition: 'new-window' }, 'allow', 1100, null],
  ['andere App als Link', { url: 'https://web.whatsapp.com/', disposition: 'foreground-tab' }, 'deny', null, 'extern'],
];

// Der Drive-Fall vom 02.11.2026: Ausgeloggt zeigt die Drive-Ansicht die
// Werbeseite workspace.google.com, „Anmelden" geht per target=_blank auf
// drive.google.com. Das muss IN der Ansicht laden, nicht im Systembrowser.
test('Drive-Werbeseite: Anmelden bleibt in der eigenen App', () => {
  const { entscheide, geoeffnet } = baueRegel('https://workspace.google.com/intl/de/products/drive/', 'drive.google.com');
  const url = 'https://drive.google.com/drive/?dmr=1';
  assert.strictEqual(entscheide({ url, disposition: 'foreground-tab' }).action, 'deny');
  assert.deepStrictEqual(geoeffnet.geladen, [url]);
  assert.deepStrictEqual(geoeffnet.extern, []);
});
test('Drive-Werbeseite: fremde Google-Seite geht weiter in den Browser', () => {
  const { entscheide, geoeffnet } = baueRegel('https://workspace.google.com/intl/de/products/drive/', 'drive.google.com');
  entscheide({ url: 'https://support.google.com/drive', disposition: 'foreground-tab' });
  assert.deepStrictEqual(geoeffnet.extern, ['https://support.google.com/drive']);
});

for (const [name, details, aktion, breite, wohin] of FAELLE) {
  test(name, () => {
    const { entscheide, geoeffnet } = baueRegel();
    const r = entscheide(details);
    assert.strictEqual(r.action, aktion, 'Aktion');
    if (breite) assert.strictEqual(r.overrideBrowserWindowOptions.width, breite, 'Fensterbreite');
    if (wohin === 'geladen') assert.deepStrictEqual(geoeffnet.geladen, [details.url], 'muss in der Ansicht laden');
    if (wohin === 'extern') assert.deepStrictEqual(geoeffnet.extern, [details.url], 'muss extern oeffnen');
    if (aktion === 'allow') {
      assert.deepStrictEqual(geoeffnet.geladen, [], 'darf die Ansicht nicht wegnavigieren');
      assert.deepStrictEqual(geoeffnet.extern, [], 'darf nicht extern oeffnen');
    }
  });
}

// wantsRealWindow einzeln
test('wantsRealWindow: nur echte Fenster-Wuensche', () => {
  assert.ok(wantsRealWindow({ url: 'about:blank' }));
  assert.ok(wantsRealWindow({ url: 'https://a.de', disposition: 'new-window' }));
  assert.ok(wantsRealWindow({ url: 'https://a.de', features: 'width=1' }));
  assert.ok(wantsRealWindow({ url: 'https://a.de', postBody: {} }));
  assert.ok(!wantsRealWindow({ url: 'https://a.de', disposition: 'foreground-tab' }));
  assert.ok(!wantsRealWindow({ url: 'https://a.de', disposition: 'foreground-tab', features: '' }));
});
