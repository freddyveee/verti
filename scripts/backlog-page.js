#!/usr/bin/env node
// Baut aus BACKLOG.md eine HTML-Checkliste (eine Quelle, keine Doppelpflege).
// Aufruf: node scripts/backlog-page.js [ausgabe.html] [--full]  – Standard: stdout.
// --full schreibt ein komplettes Dokument (lokale Vorschau .backlog-preview.html).
// Die Seite wird als Artifact veröffentlicht (siehe CLAUDE.md); sie enthält
// absichtlich kein <html>/<head>/<body>, das ergänzt der Artifact-Dienst.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'BACKLOG.md'), 'utf8');
// Nächste Version = package.json + 1 (Patch). Beim Release wird package.json
// angehoben und die Punkte wandern unter „Veröffentlicht", der Abschnitt
// „Umgesetzt" zeigt dann automatisch die übernächste Nummer.
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const nextVersion = pkg.version.replace(/(\d+)$/, (m) => String(Number(m) + 1));
// --full: komplettes HTML-Dokument (für die Vorschau als Datei); ohne Flag nur
// der Seiteninhalt, so wie der Artifact-Dienst ihn erwartet
const full = process.argv.includes('--full');
const out = process.argv.filter((a) => !a.startsWith('--'))[2];

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Inline-Markdown, das im Backlog vorkommt: `code`, [text](url), **fett**
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

// ---- BACKLOG.md lesen ----
const STATES = [
  ['offen', /^offen/i, 'open'],
  ['umgesetzt', /^umgesetzt/i, 'ready'],
  ['blockiert', /^blockiert/i, 'blocked'],
  ['ideen', /^ideen/i, 'idea'],
  ['verschoben', /^verschoben/i, 'parked'],
  ['veröffentlicht', /^veröffentlicht/i, 'shipped'],
];
const sections = []; // { title, state, items: [{text, date}], groups: [{label, date, items}] }
let intro = '';
let cur = null;
let group = null;
for (const raw of src.split('\n')) {
  const line = raw.trimEnd();
  if (line.startsWith('# ')) continue;
  if (line.startsWith('## ')) {
    const title = line.slice(3).trim();
    const st = STATES.find(([, re]) => re.test(title));
    cur = { title, state: st ? st[2] : 'open', items: [], groups: [] };
    group = null;
    sections.push(cur);
    continue;
  }
  if (line.startsWith('### ') && cur) {
    const m = /^(.*?)\s*(?:\(([^)]*)\))?\s*$/.exec(line.slice(4).trim());
    group = { label: m[1], date: m[2] || '', items: [] };
    cur.groups.push(group);
    continue;
  }
  if (/^- /.test(line) && cur) {
    let text = line.slice(2).trim();
    if (/^\(noch nichts/i.test(text)) continue; // Platzhalter
    let date = '';
    const dm = /\s*\((\d{2}\.\d{2}\.\d{4})\)\s*$/.exec(text);
    if (dm) { date = dm[1]; text = text.slice(0, dm.index); }
    (group ? group.items : cur.items).push({ text, date });
    continue;
  }
  if (!cur && line && !line.startsWith('#')) intro += (intro ? ' ' : '') + line;
}

const count = (state) => sections.filter((s) => s.state === state)
  .reduce((n, s) => n + s.items.length + s.groups.reduce((m, g) => m + g.items.length, 0), 0);
const shippedSection = sections.find((s) => s.state === 'shipped');
const latest = shippedSection && shippedSection.groups[0];
const stand = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ---- HTML ----
const GLYPH = {
  open: '<span class="box" aria-hidden="true"></span>',
  ready: '<span class="box done" aria-hidden="true"></span>',
  shipped: '<span class="box done" aria-hidden="true"></span>',
  blocked: '<span class="box blocked" aria-hidden="true"></span>',
  parked: '<span class="box parked" aria-hidden="true"></span>',
  idea: '<span class="box idea" aria-hidden="true"></span>',
};
const LABEL = { open: 'offen', ready: 'umgesetzt, wartet auf das nächste Release', shipped: 'veröffentlicht', blocked: 'blockiert', parked: 'verschoben oder verworfen', idea: 'Idee, noch nicht entschieden' };
const item = (it, state) => `<li class="item ${state}">${GLYPH[state]}<span class="text">${inline(it.text)}</span>${it.date ? `<span class="date">${esc(it.date)}</span>` : ''}</li>`;
const empty = (state) => `<li class="item empty"><span class="text">${state === 'open' ? 'Nichts offen. Neue Ideen landen hier.' : 'Nichts.'}</span></li>`;

const sectionHtml = (s) => {
  const n = s.items.length + s.groups.reduce((m, g) => m + g.items.length, 0);
  const groups = s.groups.map((g) => `
      <div class="group">
        <div class="group-head"><span class="version">${esc(g.label)}</span>${g.date ? `<span class="date">${esc(g.date)}</span>` : ''}</div>
        <ul class="items">${g.items.map((it) => item(it, s.state)).join('')}</ul>
      </div>`).join('');
  return `
    <section class="block ${s.state}">
      <header class="block-head">
        <div class="head-left"><h2>${esc(s.title)}</h2>${s.state === 'ready' ? `<span class="version next">kommt mit ${esc(nextVersion)}</span>` : ''}</div>
        <span class="count">${n}</span>
      </header>
      ${s.items.length || !s.groups.length ? `<ul class="items">${s.items.length ? s.items.map((it) => item(it, s.state)).join('') : empty(s.state)}</ul>` : ''}
      ${groups}
    </section>`;
};

const html = `<title>Verti Backlog</title>
<style>
  :root {
    --ground: #f5f4f9; --surface: #ffffff; --ink: #1e1d28; --muted: #6e6b82; --line: #e4e1ee;
    --accent: #7c3aed; --accent-ink: #5b21b6; --accent-soft: #efe9fd;
    --done: #1f9d55; --done-soft: #e6f6ec; --blocked: #d97706; --blocked-soft: #fdf1e0; --parked: #8a879c;
    --code-bg: #eeebf6;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #1a1b22; --surface: #22242c; --ink: #f2f1f7; --muted: #9a98ad; --line: #34363f;
      --accent: #b78aff; --accent-ink: #cbadff; --accent-soft: rgba(146, 87, 255, 0.16);
      --done: #4ade80; --done-soft: rgba(74, 222, 128, 0.14); --blocked: #fbbf24; --blocked-soft: rgba(251, 191, 36, 0.14); --parked: #7d7a92;
      --code-bg: rgba(255, 255, 255, 0.08);
    }
  }
  :root[data-theme="dark"] {
    --ground: #1a1b22; --surface: #22242c; --ink: #f2f1f7; --muted: #9a98ad; --line: #34363f;
    --accent: #b78aff; --accent-ink: #cbadff; --accent-soft: rgba(146, 87, 255, 0.16);
    --done: #4ade80; --done-soft: rgba(74, 222, 128, 0.14); --blocked: #fbbf24; --blocked-soft: rgba(251, 191, 36, 0.14); --parked: #7d7a92;
    --code-bg: rgba(255, 255, 255, 0.08);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 680px; margin: 0 auto; padding: 40px 24px 64px; }
  .masthead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .wordmark { font-size: 17px; font-weight: 700; letter-spacing: 0.2px; }
  .wordmark em { font-style: normal; color: var(--accent); }
  h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.4px; margin: 0; text-wrap: balance; }
  .intro { color: var(--muted); margin: 10px 0 0; max-width: 60ch; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 24px 0 32px; }
  .stat { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .stat .n { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
  .stat .l { font-size: 11px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: var(--muted); margin-top: 4px; }
  .stat.ready .n { color: var(--accent-ink); }
  .stat.blocked .n { color: var(--blocked); }
  .stat.shipped .n { color: var(--done); }
  .blocks { display: flex; flex-direction: column; gap: 18px; }
  .block { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 6px 0 8px; }
  .block-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px 8px; }
  .head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .version.next { text-transform: none; letter-spacing: 0; }
  h2 { font-size: 13px; font-weight: 700; letter-spacing: 0.7px; text-transform: uppercase; color: var(--muted); margin: 0; }
  .block.ready h2 { color: var(--accent-ink); }
  .count { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--muted); background: var(--ground); border-radius: 999px; padding: 2px 9px; }
  .items { list-style: none; margin: 0; padding: 0; }
  .item { display: grid; grid-template-columns: 20px 1fr auto; gap: 12px; align-items: start; padding: 10px 18px; border-top: 1px solid var(--line); }
  .item.empty { grid-template-columns: 1fr; color: var(--muted); font-style: italic; }
  .box { width: 18px; height: 18px; margin-top: 2px; border-radius: 5px; border: 1.5px solid var(--muted); background: transparent; position: relative; }
  .box.done { border-color: var(--done); background: var(--done); }
  .box.done::after { content: ''; position: absolute; left: 5px; top: 1.5px; width: 5px; height: 10px; border: solid #fff; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg); }
  .box.blocked { border-color: var(--blocked); background: var(--blocked-soft); }
  .box.blocked::after { content: ''; position: absolute; left: 4px; top: 7px; width: 8px; height: 2.5px; background: var(--blocked); border-radius: 2px; }
  .box.parked { border-color: var(--parked); border-style: dashed; }
  .box.idea { border-color: var(--accent); border-style: dashed; border-radius: 50%; }
  .item.idea .text { color: var(--muted); }
  .item.parked .text { color: var(--muted); }
  .text { min-width: 0; overflow-wrap: anywhere; }
  .date, .version { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .date { color: var(--muted); padding-top: 2px; }
  .group { margin-top: 6px; }
  .group-head { display: flex; align-items: center; gap: 10px; padding: 10px 18px 4px; }
  .version { font-weight: 700; color: var(--accent-ink); background: var(--accent-soft); border-radius: 6px; padding: 2px 8px; }
  code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 0.88em; background: var(--code-bg); border-radius: 4px; padding: 1px 5px; }
  a { color: var(--accent-ink); }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
  .foot { margin-top: 28px; color: var(--muted); font-size: 12.5px; }
  @media (max-width: 520px) { .stats { grid-template-columns: repeat(2, 1fr); } .item { grid-template-columns: 20px 1fr; } .date { grid-column: 2; padding-top: 0; } }
</style>
<div class="page">
  <header>
    <div class="masthead"><span class="wordmark">Verti<em>.</em></span><h1>Backlog</h1></div>
    <p class="intro">${inline(intro)}</p>
    <div class="stats">
      <div class="stat open"><div class="n">${count('open')}</div><div class="l">Offen</div></div>
      <div class="stat ready"><div class="n">${count('ready')}</div><div class="l">Bereit für ${esc(nextVersion)}</div></div>
      <div class="stat blocked"><div class="n">${count('blocked')}</div><div class="l">Blockiert</div></div>
      <div class="stat shipped"><div class="n">${count('shipped')}</div><div class="l">Veröffentlicht${latest ? ` · ${esc(latest.label)}` : ''}</div></div>
    </div>
  </header>
  <main class="blocks">${sections.map(sectionHtml).join('')}
  </main>
  <p class="foot">Quelle: <code>BACKLOG.md</code> im Verti-Repo, Stand ${stand}. Kästchen: leer = offen, Haken = umgesetzt, Strich = blockiert, lila Kreis = Idee ohne Entscheidung, gestrichelt = verschoben.</p>
</div>
`;
const doc = full ? `<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body>\n${html}</body>\n</html>\n` : html;
if (out) fs.writeFileSync(out, doc); else process.stdout.write(doc);
if (out) console.error(`Backlog-Seite geschrieben: ${out} (${html.length} Zeichen)`);
