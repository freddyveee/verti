// Vertis Sidebar-Logik auf Chrome-APIs. Was in Electron ueber window.verti
// lief, geht hier direkt an chrome.tabs / chrome.storage / den Hintergrunddienst.
const FARBEN = { graphit:'#2a2c36', marine:'#232a3a', wald:'#232f2a',
  kupfer:'#322a26', pflaume:'#2c2635', rubin:'#33262a' };
const listeEl = document.getElementById('liste');
let katalog = { apps: [], order: [] };
let meine = [];          // installierte Apps (bei Verti: state.apps)
let offen = {};          // appId -> tabId
let badges = {};
let aktiv = null;
let suchtext = '';

const send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, r));

function symbol(a) {
  const img = document.createElement('img');
  let host = 'example.com';
  try { host = new URL(a.url).hostname; } catch (e) {}
  const apex = host.split('.').slice(-2).join('.');
  const quellen = [`https://www.google.com/s2/favicons?domain=${host}&sz=64`];
  if (apex !== host) quellen.push(`https://www.google.com/s2/favicons?domain=${apex}&sz=64`);
  let i = 0;
  const weiter = () => {
    if (++i < quellen.length) { img.src = quellen[i]; return; }
    const e = document.createElement('div');
    e.className = 'ers'; e.textContent = (a.name || '?')[0].toUpperCase();
    img.replaceWith(e);
  };
  img.onload = () => { if (img.src.includes('s2/favicons') && img.naturalWidth < 32) weiter(); };
  img.onerror = weiter;
  img.src = quellen[0];
  return img;
}

function male() {
  listeEl.innerHTML = '';
  const q = suchtext.trim().toLowerCase();
  const zeigen = q ? katalog.apps.filter((a) => a.name.toLowerCase().includes(q))
                   : meine.map((id) => katalog.apps.find((a) => a.id === id)).filter(Boolean);
  if (q) { const t = document.createElement('div'); t.className = 'titel'; t.textContent = 'Suche'; listeEl.appendChild(t); }
  for (const a of zeigen) {
    const el = document.createElement('div');
    el.className = 'app' + (a.id === aktiv ? ' an' : '');
    el.appendChild(symbol(a));
    const n = document.createElement('span'); n.textContent = a.name; el.appendChild(n);
    if (badges[a.id]) { const b = document.createElement('div'); b.className = 'zahl'; b.textContent = badges[a.id]; el.appendChild(b); }
    el.addEventListener('click', async () => {
      await send({ typ: 'oeffne', id: a.id });
      if (!meine.includes(a.id)) { meine.push(a.id); await chrome.storage.local.set({ meine }); }
      aktiv = a.id; suchtext = ''; document.getElementById('suche').value = '';
      male();
    });
    el.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      await send({ typ: 'schliesse', id: a.id });
      meine = meine.filter((x) => x !== a.id);
      await chrome.storage.local.set({ meine });
      male();
    });
    listeEl.appendChild(el);
  }
}

function maleFarben(aktivFarbe) {
  const f = document.getElementById('farben');
  f.innerHTML = '';
  for (const [name, hex] of Object.entries(FARBEN)) {
    const b = document.createElement('button');
    b.className = 'farbe' + (name === aktivFarbe ? ' on' : '');
    b.style.background = hex; b.title = name;
    b.addEventListener('click', async () => {
      document.documentElement.setAttribute('data-farbe', name);
      await chrome.storage.local.set({ farbe: name });
      maleFarben(name);
    });
    f.appendChild(b);
  }
}

document.getElementById('suche').addEventListener('input', (e) => { suchtext = e.target.value; male(); });
document.getElementById('modus').addEventListener('click', async () => {
  const hell = document.documentElement.getAttribute('data-theme') !== 'light';
  document.documentElement.setAttribute('data-theme', hell ? 'light' : 'dark');
  await chrome.storage.local.set({ theme: hell ? 'light' : 'dark' });
});

chrome.runtime.onMessage.addListener((m) => { if (m.typ === 'badges') { badges = m.stand || {}; male(); } });

(async () => {
  katalog = await (await fetch(chrome.runtime.getURL('apps.json'))).json();
  const g = await chrome.storage.local.get(['meine', 'theme', 'farbe']);
  meine = g.meine || katalog.apps.filter((a) => a.imperio).map((a) => a.id);
  if (g.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  document.documentElement.setAttribute('data-farbe', g.farbe || 'graphit');
  maleFarben(g.farbe || 'graphit');
  const st = await send({ typ: 'stand' });
  offen = (st && st.tabs) || {};
  male();
})();
