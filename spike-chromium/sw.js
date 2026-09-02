// Hintergrunddienst: haelt die App-Tabs, liest Ungelesen-Zahlen aus dem
// Seitentitel (dieselbe Regel wie in Vertis main.js) und meldet sie an die
// Sidebar. In Electron war das der Hauptprozess - hier reichen Chrome-APIs.
let KATALOG = { apps: [], titleBadge: [] };
fetch(chrome.runtime.getURL('apps.json')).then(r => r.json()).then(d => { KATALOG = d; });

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// appId -> tabId
async function tabs() { return (await chrome.storage.local.get('tabs')).tabs || {}; }
async function setTabs(t) { await chrome.storage.local.set({ tabs: t }); }

// Ungelesen-Zahl aus dem Titel: bei bekannten Apps ueberall im Titel,
// sonst nur am Anfang - sonst entstehen falsche Badges aus Inhalts-Titeln.
function zahlAusTitel(titel, appId) {
  if (!titel) return 0;
  const ueberall = KATALOG.titleBadge.includes(appId);
  const m = ueberall ? titel.match(/\((\d+)\)/) : titel.match(/^\s*\((\d+)\)/);
  return m ? Math.min(parseInt(m[1], 10) || 0, 999) : 0;
}

async function badgesMelden() {
  const t = await tabs();
  const stand = {};
  for (const [appId, tabId] of Object.entries(t)) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const n = zahlAusTitel(tab.title, appId);
      if (n) stand[appId] = n;
    } catch (e) { delete t[appId]; }
  }
  await setTabs(t);
  const gesamt = Object.values(stand).reduce((a, b) => a + b, 0);
  // Zahl am Symbol der Erweiterung - das ist Chromiums Ersatz fuer Vertis Dock-Badge
  chrome.action.setBadgeText({ text: gesamt ? String(gesamt) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  chrome.runtime.sendMessage({ typ: 'badges', stand }).catch(() => {});
}

chrome.tabs.onUpdated.addListener((id, info) => { if (info.title || info.status === 'complete') badgesMelden(); });
chrome.tabs.onRemoved.addListener(badgesMelden);
setInterval(badgesMelden, 5000);

chrome.runtime.onMessage.addListener((msg, _s, antwort) => {
  (async () => {
    if (msg.typ === 'oeffne') {
      const t = await tabs();
      const vorhanden = t[msg.id];
      if (vorhanden !== undefined) {
        try { await chrome.tabs.update(vorhanden, { active: true }); antwort({ ok: true }); return; }
        catch (e) { delete t[msg.id]; }
      }
      const app = KATALOG.apps.find(a => a.id === msg.id);
      if (!app) return antwort({ ok: false });
      const tab = await chrome.tabs.create({ url: app.url, active: true, pinned: true });
      t[msg.id] = tab.id;
      await setTabs(t);
      antwort({ ok: true, tabId: tab.id });
    } else if (msg.typ === 'schliesse') {
      const t = await tabs();
      if (t[msg.id] !== undefined) { try { await chrome.tabs.remove(t[msg.id]); } catch (e) {} delete t[msg.id]; await setTabs(t); }
      antwort({ ok: true });
    } else if (msg.typ === 'stand') {
      antwort({ tabs: await tabs() });
    }
  })();
  return true;
});
