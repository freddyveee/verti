// ERZEUGT von scripts/chromium-port.js aus update.html - NICHT von Hand aendern.
// Aenderungen gehoeren in update.html im Projektwurzel-Verzeichnis,
// danach "node scripts/chromium-port.js" laufen lassen.

  const content = document.getElementById('content');
  let mode = null;
  let closable = false;
  let forced = false;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function notesHtml(notes) {
    if (!notes) return '';
    const lines = String(notes).split('\n').map((l) => l.trim()).filter(Boolean);
    const items = lines
      .map((l) => (l.startsWith('•') ? `<li>${esc(l.slice(1).trim())}</li>` : `<p>${esc(l)}</p>`))
      .join('');
    return `
      <details>
        <summary>Was ist neu</summary>
        <div class="notes"><ul>${items}</ul></div>
      </details>`;
  }

  function render(s) {
    mode = s.mode;
    if (typeof s.forced === 'boolean') forced = s.forced;
    document.body.classList.toggle('forced', forced);
    closable = mode === 'celebrate' || (!forced && ['available', 'error'].includes(mode));

    if (mode === 'available') {
      const laterBtn = forced ? '' : `<button class="btn btn-ghost" id="later">Später</button>`;
      content.innerHTML = `
        <div class="emoji">🚀</div>
        <h1>${forced ? 'Update erforderlich' : 'Update verfügbar'}</h1>
        <div class="sub">${forced
          ? `Bitte aktualisiere auf Verti ${esc(s.version)}, um weiterzuarbeiten.`
          : `Verti ${esc(s.version)} ist bereit für dich.`}</div>
        ${notesHtml(s.notes)}
        <div class="buttons">
          <button class="btn btn-primary" id="go">Jetzt aktualisieren</button>
          ${laterBtn}
        </div>
        <div class="footnote">Alle Logins und Apps bleiben erhalten.</div>`;
      document.getElementById('go').onclick = () => window.vertiUpdate.action('update');
      const later = document.getElementById('later');
      if (later) later.onclick = () => window.vertiUpdate.action('close');
    }

    if (mode === 'downloading') {
      // Balken nur beim ersten Mal neu aufbauen, danach nur den Fortschritt setzen
      if (!document.getElementById('fill')) {
        content.innerHTML = `
          <div class="emoji">⬇️</div>
          <h1>Update wird geladen…</h1>
          <div class="sub">Verti startet danach automatisch neu.</div>
          <div class="progress-track"><div class="progress-fill" id="fill"></div></div>
          <div class="percent" id="percent">0 %</div>`;
      }
      const p = Math.max(0, Math.min(100, Math.round(s.percent || 0)));
      document.getElementById('fill').style.width = p + '%';
      document.getElementById('percent').textContent = p + ' %';
    }

    if (mode === 'installing') {
      content.innerHTML = `
        <div class="emoji">✨</div>
        <h1>Wird installiert…</h1>
        <div class="sub">Verti startet gleich neu – bis gleich! 👋</div>`;
    }

    if (mode === 'celebrate') {
      content.innerHTML = `
        <div class="emoji">🎉</div>
        <h1>Update geschafft!</h1>
        <div class="sub">Verti ist jetzt auf Version ${esc(s.version)}.</div>
        <div class="buttons">
          <button class="btn btn-primary" id="ok">Los geht's</button>
        </div>`;
      document.getElementById('ok').onclick = () => window.vertiUpdate.action('close');
      startConfetti();
    }

    if (mode === 'error') {
      const btns = forced
        ? `<button class="btn btn-primary" id="retry">Erneut versuchen</button>
           <button class="btn btn-ghost" id="defer">Später weiterarbeiten</button>`
        : `<button class="btn btn-ghost" id="ok">Schließen</button>`;
      content.innerHTML = `
        <div class="emoji">😕</div>
        <h1>Das hat nicht geklappt</h1>
        <div class="sub">Der Download ist fehlgeschlagen.<br>${forced
          ? 'Versuch es erneut – oder arbeite vorerst weiter, beim nächsten Start fragt Verti wieder.'
          : 'Versuch es später einfach noch einmal.'}</div>
        <div class="buttons">${btns}</div>`;
      if (forced) {
        document.getElementById('retry').onclick = () => window.vertiUpdate.action('update');
        document.getElementById('defer').onclick = () => window.vertiUpdate.action('defer');
      } else {
        document.getElementById('ok').onclick = () => window.vertiUpdate.action('close');
      }
    }
  }

  window.vertiUpdate.onState(render);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closable) window.vertiUpdate.action('close');
  });

  function startConfetti() {
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    const W = (canvas.width = canvas.offsetWidth);
    const H = (canvas.height = canvas.offsetHeight);
    const colors = ['#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#f9fafb', '#fb923c'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 1.5 + Math.random() * 2.5,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: -0.1 + Math.random() * 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      sway: Math.random() * Math.PI * 2,
    }));
    // Nach ein paar Sekunden kein Nachschub mehr: Teile fallen aus dem Bild,
    // der Regen wird dünner und hört von selbst auf
    const spawnUntil = performance.now() + 4000;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      let visible = 0;
      for (const p of pieces) {
        p.sway += 0.05;
        p.x += p.vx + Math.sin(p.sway) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 20) {
          if (performance.now() > spawnUntil) continue;
          p.y = -20;
          p.x = Math.random() * W;
        }
        visible++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (mode === 'celebrate' && visible > 0) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    }
    tick();
  }
