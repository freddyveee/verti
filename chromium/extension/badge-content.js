// Malt Vertis Ungelesen-Zahl ins Favicon der Seite.
//
// Warum so: In Electron stand die Zahl am Symbol in Vertis eigener Sidebar.
// In Chromium ist Vertis App-Leiste die eingebaute vertikale Tableiste, und
// die zeigt nur das Favicon. Statt Chromium umzubauen malen wir die Zahl also
// ins Favicon - Chromium uebernimmt ein per Skript gesetztes Favicon
// (am 02.09.2026 gemessen).
//
// WICHTIG, damit es keine doppelten Zahlen gibt: wir malen NUR, wenn die Zahl
// im Seitentitel steht. Apps, die ihr Favicon selbst bemalen (Stackfield ueber
// Favico.js), schreiben nichts in den Titel - deren Favicon fassen wir nicht
// an, sie zeigen ihre eigene Zahl weiter.

(() => {
  // Gleiche Regel wie in main.js und sw.js: bei bekannten Apps zaehlt eine Zahl
  // ueberall im Titel, sonst nur am Anfang. Sonst entstehen falsche Zahlen aus
  // Inhalts-Titeln ("Rechnung (2) - Drive").
  let ueberall = false;
  let aktiv = false;          // laeuft nur in Tabs, die zu einer Verti-App gehoeren
  let letzteZahl = -1;
  let originalHref = null;    // Favicon der Seite, bevor wir es angefasst haben
  let eigenesHref = null;     // was wir zuletzt selbst gesetzt haben

  function zahlAusTitel(titel) {
    if (!titel) return 0;
    const m = ueberall ? titel.match(/\((\d+)\)/) : titel.match(/^\s*\((\d+)\)/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    return n > 0 ? Math.min(n, 999) : 0;
  }

  function faviconLink() {
    return document.querySelector('link[rel~="icon"], link[rel="shortcut icon"]');
  }

  function merkeOriginal() {
    if (originalHref !== null) return;
    const l = faviconLink();
    originalHref = l ? l.href : new URL('/favicon.ico', location.origin).href;
  }

  function setzeFavicon(href) {
    for (const l of document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]')) l.remove();
    const neu = document.createElement('link');
    neu.rel = 'icon';
    neu.href = href;
    (document.head || document.documentElement).appendChild(neu);
    eigenesHref = href;
  }

  async function male(zahl) {
    merkeOriginal();
    if (!zahl) {
      if (eigenesHref) { setzeFavicon(originalHref); eigenesHref = null; }
      return;
    }
    const g = document.createElement('canvas');
    g.width = 64; g.height = 64;
    const c = g.getContext('2d');

    // Das Originalbild darunter legen. Klappt es nicht (fehlendes Favicon oder
    // fremde Herkunft ohne CORS), malen wir nur die Blase - besser als keine
    // Zahl.
    try {
      const bild = new Image();
      bild.crossOrigin = 'anonymous';
      await new Promise((res, rej) => {
        bild.onload = res;
        bild.onerror = rej;
        bild.src = originalHref;
        setTimeout(rej, 2500);
      });
      c.drawImage(bild, 0, 0, 64, 64);
    } catch (e) { /* ohne Grundbild weiter */ }

    const text = zahl > 99 ? '99+' : String(zahl);
    const breit = text.length > 2;
    const r = 20;
    const mx = breit ? 40 : 44;

    c.fillStyle = '#7c3aed';
    c.beginPath();
    if (breit) {
      c.roundRect(20, 0, 44, 2 * r, r);
    } else {
      c.arc(mx, r, r, 0, Math.PI * 2);
    }
    c.fill();

    c.fillStyle = '#ffffff';
    c.font = 'bold ' + (breit ? 22 : 28) + 'px system-ui, -apple-system, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, breit ? 42 : mx, r + 1);

    try {
      setzeFavicon(g.toDataURL('image/png'));
    } catch (e) {
      // Leinwand ist durch ein fremdes Bild "vergiftet" - dann ohne Grundbild
      // neu malen, das ist immer erlaubt.
      const g2 = document.createElement('canvas');
      g2.width = 64; g2.height = 64;
      const c2 = g2.getContext('2d');
      c2.fillStyle = '#7c3aed';
      c2.beginPath(); c2.roundRect(2, 2, 60, 60, 14); c2.fill();
      c2.fillStyle = '#fff';
      c2.font = 'bold 34px system-ui, -apple-system, sans-serif';
      c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.fillText(text, 32, 34);
      setzeFavicon(g2.toDataURL('image/png'));
    }
  }

  function pruefe() {
    if (!aktiv) return;
    const n = zahlAusTitel(document.title);
    if (n === letzteZahl) return;
    letzteZahl = n;
    male(n);
  }

  // Beim Start fragen, ob dieser Tab ueberhaupt zu einer Verti-App gehoert und
  // welche Titel-Regel gilt.
  chrome.runtime.sendMessage({ ruf: 'badge-regel' }, (a) => {
    if (chrome.runtime.lastError || !a || !a.wert || !a.wert.istApp) return;
    aktiv = true;
    ueberall = !!a.wert.ueberall;
    pruefe();
    // Titel aendert sich bei Web-Apps staendig, ohne dass die Seite neu laedt
    const kopf = document.querySelector('title');
    if (kopf) new MutationObserver(pruefe).observe(kopf, { childList: true, characterData: true, subtree: true });
    if (document.head) new MutationObserver(pruefe).observe(document.head, { childList: true });
    // Sicherheitsnetz: manche Apps tauschen das <title>-Element komplett aus
    setInterval(pruefe, 3000);
  });
})();
