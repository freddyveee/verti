// ERZEUGT von scripts/sidebar-port.js aus sidebar.html - NICHT von Hand aendern.
// Aenderungen gehoeren in sidebar.html im Projektwurzel-Verzeichnis, danach
// "node scripts/sidebar-port.js" laufen lassen.

    (async () => {
      let apps = await window.verti.getApps();
      const catalog = await window.verti.getCatalog();
      const catOrder = await window.verti.getCategoryOrder();
      let badgeCounts = await window.verti.getBadges();
      let audioStates = await window.verti.getAudio();
      const appInfo = await window.verti.getAppInfo();
      const initSettings = await window.verti.getSettings();
      if (initSettings.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
      if (initSettings.themeColor) document.documentElement.setAttribute('data-farbe', initSettings.themeColor);
      const sv = document.getElementById('settingsVersion');
      if (sv) sv.textContent = appInfo.version + (appInfo.packaged ? '' : ' (Dev)');
      if (appInfo.admin) {
        const ar = document.getElementById('adminRow');
        if (ar) ar.style.display = '';
        const ab = document.getElementById('openAdmin');
        if (ab) ab.addEventListener('click', () => window.verti.openAdmin());
        const cb2 = document.getElementById('openCompat');
        if (cb2) cb2.addEventListener('click', () => window.verti.openCompatCheck());
      }
      if (!appInfo.packaged) {
        const devTag = document.getElementById('devTag');
        devTag.title = `Dev-Version ${appInfo.version} aus ~/Projekte/verti`;
        devTag.classList.add('show');
      }
      const appsEl = document.getElementById('apps');
      const catalogEl = document.getElementById('catalog');
      const library = document.getElementById('library');
      const settingsEl = document.getElementById('settings');
      let activeId = null;

      // Icon-Kette: eigenes Icon → Favicon der Subdomain → Favicon der Hauptdomain → Buchstabe.
      // Googles Favicon-Dienst liefert bei unbekannten Subdomains einen 16px-Globus,
      // erkennbar an der geringen Auflösung — dann weiter zur nächsten Quelle.
      function iconFor(app) {
        const hostname = new URL(app.url).hostname;
        const apex = hostname.split('.').slice(-2).join('.');
        const sources = [];
        // Cache-Buster: lokale Icons sonst nach Updates veraltet aus dem Bildcache
        if (app.icon) sources.push(app.icon + (app.icon.includes('?') ? '&v=' : '?v=') + Date.now());
        sources.push('https://www.google.com/s2/favicons?domain=' + hostname + '&sz=64');
        if (apex !== hostname) {
          sources.push('https://www.google.com/s2/favicons?domain=' + apex + '&sz=64');
        }

        const img = document.createElement('img');
        let i = 0;
        const isGeneric = () => img.src.includes('s2/favicons') && img.naturalWidth < 32;
        const next = () => {
          i++;
          if (i < sources.length) {
            img.src = sources[i];
          } else {
            const fb = document.createElement('div');
            fb.className = 'fallback';
            fb.textContent = app.name[0].toUpperCase();
            img.replaceWith(fb);
          }
        };
        img.onload = () => { if (isGeneric()) next(); };
        img.onerror = next;
        img.src = sources[0];
        return img;
      }

      // Sortieren per Ziehen, wie auf dem iPhone: Das gezogene Icon folgt dem
      // Zeiger, die anderen rutschen live in ihre neue Position (Transition auf
      // transform), beim Loslassen gleitet das Icon in die Lücke und erst dann
      // wird die Reihenfolge übernommen. Erst ab 5 px Bewegung wird gezogen,
      // ein normaler Klick bleibt ein Klick. Während des Ziehens wird die
      // Sidebar nicht neu aufgebaut (Badge-Updates warten bis zum Loslassen).
      let drag = null; // { btn, from, to, pitch, startY, pointerId, moved }
      let pendingRender = false;
      let suppressClick = false;
      const listItems = () => [...appsEl.querySelectorAll('.app-btn')];
      function dragShift(items, from, to) {
        items.forEach((el, j) => {
          if (el === drag.btn) return;
          let shift = 0;
          if (from < to && j > from && j <= to) shift = -drag.pitch;
          else if (from > to && j >= to && j < from) shift = drag.pitch;
          el.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      }
      function onDragMove(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const dy = e.clientY - drag.startY;
        if (!drag.moved) {
          if (Math.abs(dy) < 5) return;
          drag.moved = true;
          drag.btn.classList.add('dragging');
        }
        const items = listItems();
        drag.to = Math.max(0, Math.min(items.length - 1, drag.from + Math.round(dy / drag.pitch)));
        drag.btn.style.transform = `translateY(${dy}px) scale(1.08)`;
        dragShift(items, drag.from, drag.to);
      }
      function onDragEnd(e) {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const d = drag;
        drag = null;
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragEnd);
        window.removeEventListener('pointercancel', onDragEnd);
        if (!d.moved) return; // war nur ein Klick
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0); // der Klick kommt direkt nach pointerup
        d.btn.classList.remove('dragging');
        d.btn.style.transform = `translateY(${(d.to - d.from) * d.pitch}px)`; // in die Lücke gleiten
        setTimeout(() => {
          // Positionen sind erreicht: Transforms ohne Animation zurücksetzen
          // und das DOM in dieselbe Reihenfolge bringen → kein sichtbarer Sprung
          appsEl.classList.add('no-anim');
          for (const el of listItems()) el.style.transform = '';
          const others = listItems().filter((el) => el !== d.btn);
          appsEl.insertBefore(d.btn, others[d.to] || null);
          void appsEl.offsetHeight;
          appsEl.classList.remove('no-anim');
          const ids = listItems().map((b) => b.dataset.id);
          if (ids.join() !== apps.map((a) => a.id).join()) window.verti.reorderApps(ids);
          if (pendingRender) { pendingRender = false; renderSidebar(); }
        }, 200);
      }

      // Badge/Audio/Aktiv-Zustand IN PLACE ändern, ohne die Icons neu zu laden.
      // renderSidebar() baut sonst alles neu (iconFor hängt Date.now() an die
      // URL) → Remote-Logos wie Google Kalender/Drive flackern bei jeder
      // Badge- oder Musik-Änderung. Diese Helfer fassen nur die Zusatz-Elemente an.
      function setBadgeOn(btn, id) {
        const count = badgeCounts[id] || 0;
        let b = btn.querySelector(':scope > .badge');
        if (count > 0) {
          if (!b) { b = document.createElement('span'); b.className = 'badge'; btn.appendChild(b); }
          b.textContent = count > 99 ? '99+' : String(count);
        } else if (b) { b.remove(); }
      }
      function setPlayingOn(btn, id) {
        let e = btn.querySelector(':scope > .playing');
        if (audioStates[id]) {
          if (!e) {
            e = document.createElement('span');
            e.className = 'playing';
            e.title = (btn.title || '') + ' spielt';
            e.innerHTML = '<i></i><i></i><i></i>';
            btn.appendChild(e);
          }
        } else if (e) { e.remove(); }
      }
      const eachBtn = (fn) => { for (const btn of document.querySelectorAll('.sidebar .app-btn')) fn(btn, btn.dataset.id); };
      const refreshBadges = () => eachBtn(setBadgeOn);
      const refreshPlaying = () => eachBtn(setPlayingOn);
      const refreshActive = () => { for (const btn of document.querySelectorAll('.sidebar .app-btn')) btn.classList.toggle('active', btn.dataset.id === activeId); };

      const PINNED_ID = 'browser';
      function renderPinned() {
        const pinned = document.getElementById('pinned');
        pinned.innerHTML = '';
        const app = apps.find((a) => a.id === PINNED_ID);
        if (!app) return;
        const btn = document.createElement('button');
        btn.className = 'app-btn' + (app.id === activeId ? ' active' : '');
        btn.title = app.name;
        btn.dataset.id = app.id;
        btn.appendChild(iconFor(app));
        btn.addEventListener('click', () => { if (suppressClick) return; window.verti.switchApp(app.id); });
        btn.addEventListener('contextmenu', (e) => { e.preventDefault(); window.verti.showAppMenu(app.id); });
        pinned.appendChild(btn);
      }
      function renderSidebar() {
        renderPinned();
        if (drag && drag.moved) { pendingRender = true; return; }
        appsEl.innerHTML = '';
        for (const app of apps) {
          if (app.id === PINNED_ID) continue; // Browser sitzt fix oben
          const btn = document.createElement('button');
          btn.className = 'app-btn' + (app.id === activeId ? ' active' : '');
          btn.title = app.name;
          btn.dataset.id = app.id;
          btn.appendChild(iconFor(app));
          setBadgeOn(btn, app.id);
          setPlayingOn(btn, app.id);
          btn.addEventListener('click', () => {
            if (suppressClick) return; // Loslassen nach dem Ziehen ist kein Klick
            window.verti.switchApp(app.id);
          });
          btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            window.verti.showAppMenu(app.id);
          });
          btn.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || drag) return;
            const items = listItems();
            if (items.length < 2) return;
            const pitch = items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top || 56;
            const from = items.indexOf(btn);
            drag = { btn, from, to: from, pitch, startY: e.clientY, pointerId: e.pointerId, moved: false };
            try { btn.setPointerCapture(e.pointerId); } catch {}
            window.addEventListener('pointermove', onDragMove);
            window.addEventListener('pointerup', onDragEnd);
            window.addEventListener('pointercancel', onDragEnd);
          });
          appsEl.appendChild(btn);
        }
      }

      function makeCard(item, installedIds) {
        const card = document.createElement('div');
        card.className = 'card';
        card.appendChild(iconFor(item));
        const info = document.createElement('div');
        info.className = 'info';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = item.name;
        info.appendChild(name);
        if (item.stufe) {
          const st = document.createElement('span');
          st.className = 'stufe ' + item.stufe;
          if (item.stufe === 'geprueft') {
            st.textContent = 'Geprüft';
            st.title = 'Von uns durchgespielt am ' + (item.datum || '?') + ' (Anmeldung, Kernfunktion, Badges).';
          } else if (item.stufe === 'experimentell') {
            st.textContent = 'Experimentell';
            st.title = 'Bekannt wackelig – kann jederzeit klemmen.';
          } else {
            st.textContent = 'Unterstützt';
            st.title = 'Lädt im automatischen Durchlauf. Wir prüfen sie nicht einzeln von Hand.';
          }
          info.appendChild(st);
        }
        card.appendChild(info);
        const btn = document.createElement('button');
        if (installedIds.has(item.id)) {
          btn.className = 'remove';
          btn.textContent = 'Entfernen';
          btn.addEventListener('click', () => window.verti.removeApp(item.id));
        } else {
          btn.className = 'add';
          btn.textContent = 'Hinzufügen';
          btn.addEventListener('click', () => window.verti.addApp(item));
        }
        card.appendChild(btn);
        return card;
      }

      let libQuery = '';
      const expandedCats = new Set();
      const CAT_LIMIT = 6; // je Kategorie erst so viele, Rest per „Mehr sehen"
      function setMoreLabel(btn, open) {
        btn.classList.toggle('open', open);
        btn.textContent = open ? 'Weniger anzeigen' : ('Alle ' + btn._total + ' zeigen');
        const c = document.createElement('span'); c.className = 'caret'; c.textContent = '\u25BE';
        btn.appendChild(c);
      }
      // Höhe, bei der die Kategorie nach CAT_LIMIT ganze Reihen zeigt (Rest wird geklappt)
      function collapsedHeightFor(grid) {
        const tiles = grid.children;
        if (tiles.length <= CAT_LIMIT) return null;
        const gtop = grid.getBoundingClientRect().top;
        const rowTop = tiles[CAT_LIMIT - 1].getBoundingClientRect().top;
        let cut = null;
        for (let i = CAT_LIMIT; i < tiles.length; i++) {
          if (tiles[i].getBoundingClientRect().top > rowTop + 1) { cut = tiles[i]; break; }
        }
        if (cut === null) return null; // die ersten liegen schon in der letzten Reihe
        const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
        return (cut.getBoundingClientRect().top - gap) - gtop;
      }
      function clampAll() {
        catalogEl.querySelectorAll('.grid[data-cat]').forEach((grid) => {
          if (expandedCats.has(grid.dataset.cat)) { grid.style.maxHeight = 'none'; grid.style.overflow = 'visible'; return; }
          const ch = collapsedHeightFor(grid);
          if (ch === null) { grid.style.maxHeight = 'none'; grid.style.overflow = 'visible'; }
          else { grid.style.maxHeight = ch + 'px'; grid.style.overflow = 'hidden'; }
        });
      }
      function toggleCat(cat, grid, btn) {
        const opening = !expandedCats.has(cat);
        grid.style.overflow = 'hidden';
        if (opening) {
          expandedCats.add(cat);
          const ch = collapsedHeightFor(grid);
          grid.style.maxHeight = (ch === null ? grid.scrollHeight : ch) + 'px';
          grid.getBoundingClientRect(); // Reflow erzwingen
          requestAnimationFrame(() => { grid.style.maxHeight = grid.scrollHeight + 'px'; });
          grid.addEventListener('transitionend', function te(ev) {
            if (ev.propertyName !== 'max-height') return;
            grid.removeEventListener('transitionend', te);
            if (expandedCats.has(cat)) { grid.style.maxHeight = 'none'; grid.style.overflow = 'visible'; }
          });
          setMoreLabel(btn, true);
        } else {
          expandedCats.delete(cat);
          grid.style.maxHeight = grid.scrollHeight + 'px';
          grid.getBoundingClientRect(); // Reflow erzwingen
          const ch = collapsedHeightFor(grid);
          requestAnimationFrame(() => { grid.style.maxHeight = (ch === null ? 0 : ch) + 'px'; });
          setMoreLabel(btn, false);
        }
      }
      function renderCatalog() {
        catalogEl.innerHTML = '';
        const installedIds = new Set(apps.map((a) => a.id));
        const extras = apps.filter((a) => !catalog.some((c) => c.id === a.id));
        // nach Kategorie gruppieren; selbst hinzugefügte Apps unter „Weitere"
        const byCat = {};
        for (const c of catalog) { const k = c.category || 'Weitere'; (byCat[k] = byCat[k] || []).push(c); }
        for (const e of extras) (byCat['Weitere'] = byCat['Weitere'] || []).push(e);
        const order = [...catOrder, ...Object.keys(byCat).filter((k) => !catOrder.includes(k)).sort()];
        const q = libQuery.trim().toLowerCase();
        for (const cat of order) {
          let items = byCat[cat];
          if (!items || !items.length) continue;
          if (q) items = items.filter((a) => a.name.toLowerCase().includes(q));
          if (!items.length) continue;
          const head = document.createElement('div');
          head.className = 'cat-head';
          const h = document.createElement('h2');
          h.textContent = cat;
          head.appendChild(h);
          const hasMore = !q && items.length > CAT_LIMIT;
          let moreBtn = null;
          if (hasMore) {
            moreBtn = document.createElement('button');
            moreBtn.className = 'more-btn';
            moreBtn._total = items.length;
            head.appendChild(moreBtn);
          }
          catalogEl.appendChild(head);
          const grid = document.createElement('div');
          grid.className = 'grid';
          if (hasMore) grid.dataset.cat = cat;
          for (const item of items) grid.appendChild(makeCard(item, installedIds)); // immer alle (zum Aufklappen)
          catalogEl.appendChild(grid);
          if (moreBtn) {
            setMoreLabel(moreBtn, expandedCats.has(cat));
            moreBtn.addEventListener('click', () => toggleCat(cat, grid, moreBtn));
          }
        }
        if (q && !catalogEl.children.length) {
          const nh = document.createElement('div'); nh.className = 'no-hits';
          nh.textContent = 'Keine App gefunden.'; catalogEl.appendChild(nh);
        }
        requestAnimationFrame(clampAll);
      }

      function openLibrary() {
        libQuery = '';
        expandedCats.clear();
        const se = document.getElementById('appSearch');
        if (se) se.value = '';
        renderCatalog();
        library.classList.add('open');
        applyNavState();
        requestAnimationFrame(clampAll);
        window.verti.openLibrary();
        setTimeout(() => { const s = document.getElementById('appSearch'); if (s) s.focus(); }, 60);
      }
      function closeLibrary(notify) {
        library.classList.remove('open');
        applyNavState();
        if (notify) window.verti.closeLibrary();
      }

      const isMac = window.verti.platform === 'darwin';
      const mod = isMac ? 'Cmd' : 'Strg';
      if (!isMac) document.body.classList.add('win');
      const navBack = document.getElementById('navBack');
      const navForward = document.getElementById('navForward');
      const navHomeBtn = document.getElementById('navHome');
      navBack.title = `Zurück (${mod}+[)`;
      navForward.title = `Vorwärts (${mod}+])`;
      navHomeBtn.title = `Zur Startseite der App (${mod}+Shift+H)`;
      // In der offenen Bibliothek heißen „Zurück" und „Startseite": Bibliothek
      // schließen, zurück zur App (man drückt intuitiv den Pfeil, nicht das ✕).
      // Der Pfeil bleibt dort klickbar, auch wenn die App keinen Verlauf hat;
      // Vorwärts gibt es in der Bibliothek nicht.
      let navState = { canGoBack: false, canGoForward: false };
      function applyNavState() {
        const inLibrary = library.classList.contains('open') || settingsEl.classList.contains('open') || document.getElementById('feedback').classList.contains('open');
        navBack.disabled = inLibrary ? false : !navState.canGoBack;
        navForward.disabled = inLibrary ? true : !navState.canGoForward;
      }
      navBack.addEventListener('click', () => {
        if (document.getElementById('feedback').classList.contains('open')) closeFeedback();
        else if (settingsEl.classList.contains('open')) closeSettings(true);
        else if (library.classList.contains('open')) closeLibrary(true);
        else window.verti.navBack();
      });
      navForward.addEventListener('click', () => window.verti.navForward());
      navHomeBtn.addEventListener('click', () => {
        if (document.getElementById('feedback').classList.contains('open')) closeFeedback();
        else if (settingsEl.classList.contains('open')) closeSettings(true);
        else if (library.classList.contains('open')) closeLibrary(true);
        else window.verti.navHome();
      });
      window.verti.onNavState((s) => {
        navState = s;
        applyNavState();
      });

      document.getElementById('plus').addEventListener('click', openLibrary);
      document.getElementById('appSearch').addEventListener('input', (e) => { libQuery = e.target.value; renderCatalog(); });
      window.addEventListener('resize', () => { if (library.classList.contains('open')) clampAll(); });

      // ---------- Farbwelten ----------
      // Vorschau-Farben muessen zu den CSS-Bloecken oben passen (dunkler Satz).
      const FARB_VORSCHAU = { graphit: '#2a2c36', marine: '#232a3a', wald: '#232f2a',
        kupfer: '#322a26', pflaume: '#2c2635', rubin: '#33262a' };
      const FARB_NAME = { graphit: 'Graphit', marine: 'Marine', wald: 'Wald',
        kupfer: 'Kupfer', pflaume: 'Pflaume', rubin: 'Rubin' };
      function baueFarbwahl(ziel, aktiv, welten) {
        if (!ziel) return;
        ziel.innerHTML = '';
        for (const f of (welten || Object.keys(FARB_VORSCHAU))) {
          const b = document.createElement('button');
          b.className = 'farbe' + (f === aktiv ? ' on' : '');
          b.style.background = FARB_VORSCHAU[f] || '#333';
          b.title = FARB_NAME[f] || f;
          b.dataset.f = f;
          b.addEventListener('click', () => {
            window.verti.setThemeColor(f);
            document.querySelectorAll('.farben .farbe').forEach((x) => x.classList.toggle('on', x.dataset.f === f));
          });
          ziel.appendChild(b);
        }
      }

      // ---------- Browser-Seitenkarte ----------
      // Getrennt von den Verti-Einstellungen: hier nur Browser-Sachen. Der
      // Darstellungs-Schalter faerbt bewusst ganz Verti um (eine Quelle).
      const bpanel = document.getElementById('bpanel');
      async function oeffneBrowserKarte() {
        const cur = await window.verti.getSettings();
        markSeg('bpTheme', cur.theme);
        baueFarbwahl(document.getElementById('bpFarben'), cur.themeColor, cur.farbwelten);
        const n = await window.verti.historyCount();
        document.getElementById('bpHistN').textContent = n ? n + ' Seiten' : 'leer';
        document.getElementById('bpNewTabKbd').textContent = (window.verti.platform === 'darwin' ? 'Cmd' : 'Strg') + '+T';
        zeigeKartenHaupt();
        bpanel.classList.add('open');
        window.verti.browserPanelState(true); // App-Ansichten machen rechts Platz
      }
      function schliesseBrowserKarte() { bpanel.classList.remove('open'); window.verti.browserPanelState(false); }
      window.verti.onOpenBrowserPanel(oeffneBrowserKarte);
      document.getElementById('bpanelX').addEventListener('click', schliesseBrowserKarte);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bpanel.classList.contains('open')) schliesseBrowserKarte(); });
      document.getElementById('bpNewTab').addEventListener('click', () => { window.verti.browserNewTab(); schliesseBrowserKarte(); });
      // Erweiterungen bleiben IN der Seitenkarte (zweite Ansicht) statt in die
      // allgemeinen Einstellungen zu springen - das Puzzle soll Erweiterungen
      // zeigen, nicht die Einstellungen aufreissen.
      const bpHaupt = document.getElementById('bpHaupt');
      const bpErw = document.getElementById('bpErw');
      async function zeigeErweiterungen() {
        const liste = await window.verti.extList();
        const ziel = document.getElementById('bpErwListe');
        ziel.innerHTML = '';
        if (!liste.length) {
          const leer = document.createElement('div');
          leer.className = 'bpanel-item';
          leer.style.color = 'var(--text-2)';
          leer.style.cursor = 'default';
          leer.textContent = 'Noch keine Erweiterung geladen.';
          ziel.appendChild(leer);
        } else {
          for (const e of liste) {
            const row = document.createElement('div');
            row.className = 'bpanel-item';
            row.style.cursor = 'default';
            const t = document.createElement('span');
            t.textContent = e.name;
            const del = document.createElement('button');
            del.textContent = 'Entfernen';
            del.style.cssText = 'margin-left:auto;background:transparent;border:0;color:var(--text-2);font:inherit;font-size:12.5px;cursor:pointer';
            del.addEventListener('click', async () => { await window.verti.extRemove(e.id); zeigeErweiterungen(); renderExt(); });
            row.appendChild(t); row.appendChild(del);
            ziel.appendChild(row);
          }
        }
        bpHaupt.style.display = 'none';
        bpErw.style.display = '';
      }
      function zeigeKartenHaupt() { bpErw.style.display = 'none'; bpHaupt.style.display = ''; }
      document.getElementById('bpExt').addEventListener('click', zeigeErweiterungen);
      document.getElementById('bpErwZurueck').addEventListener('click', zeigeKartenHaupt);
      document.getElementById('bpErwAdd').addEventListener('click', async () => {
        const r = await window.verti.extAdd();
        if (r && r.ok) { zeigeErweiterungen(); renderExt(); }
      });
      document.getElementById('bpDown').addEventListener('click', () => { window.verti.openDownloadsFolder(); schliesseBrowserKarte(); });
      document.getElementById('bpHist').addEventListener('click', async () => {
        await window.verti.historyClear();
        document.getElementById('bpHistN').textContent = 'geleert';
      });
      document.getElementById('bpAlle').addEventListener('click', () => { schliesseBrowserKarte(); openSettings(); });
      document.getElementById('bpTheme').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        window.verti.setTheme(b.dataset.v);
        markSeg('bpTheme', b.dataset.v);
        markSeg('segTheme', b.dataset.v);
      }));

      // ---------- Chrome-Erweiterungen ----------
      // Electron laedt nur ENTPACKTE Ordner, keine .crx und nichts aus dem
      // Chrome Web Store. Deshalb der Ordner-Dialog statt eines Store-Knopfes.
      const extListEl = document.getElementById('extList');
      async function renderExt() {
        const liste = await window.verti.extList();
        extListEl.innerHTML = '';
        if (!liste.length) {
          const leer = document.createElement('div');
          leer.className = 'setrow';
          leer.innerHTML = '<div class="setlabel"><span>Noch keine Erweiterung geladen.</span></div>';
          extListEl.appendChild(leer);
          return;
        }
        for (const e of liste) {
          const row = document.createElement('div');
          row.className = 'setrow';
          const lab = document.createElement('div');
          lab.className = 'setlabel';
          const b = document.createElement('b');
          b.textContent = e.name + '  ' + e.version;
          const sp = document.createElement('span');
          sp.textContent = e.beschreibung || e.pfad;
          lab.appendChild(b); lab.appendChild(sp);
          const wrap = document.createElement('div');
          wrap.className = 'verwrap';
          const del = document.createElement('button');
          del.className = 'setbtn';
          del.textContent = 'Entfernen';
          del.addEventListener('click', async () => { await window.verti.extRemove(e.id); renderExt(); });
          wrap.appendChild(del);
          row.appendChild(lab); row.appendChild(wrap);
          extListEl.appendChild(row);
        }
      }
      document.getElementById('extAdd').addEventListener('click', async () => {
        const hinweis = document.getElementById('extHinweis');
        const r = await window.verti.extAdd();
        if (r && r.ok) { hinweis.textContent = '„' + r.name + '" hinzugefügt.'; renderExt(); }
        else if (r && r.error) { hinweis.textContent = r.error; }
      });
      renderExt();
      // Puzzle-Symbol im Browser oeffnet die Einstellungen beim Abschnitt Erweiterungen
      window.verti.onOpenSettingsSection(async (abschnitt) => {
        if (abschnitt === 'erweiterungen') { await oeffneBrowserKarte(); await zeigeErweiterungen(); return; }
        openSettings();
        if (true) return;
        setTimeout(() => {
          const el = document.getElementById('extList');
          if (!el) return;
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          // kurz hervorheben, damit klar ist, wo man gelandet ist
          el.style.transition = 'background .3s';
          el.style.background = 'rgba(124,58,237,.18)';
          setTimeout(() => { el.style.background = ''; }, 1400);
        }, 140);
      });

      // ---------- Verbesserung vorschlagen (Feedback) ----------
      const fbModal = document.getElementById('feedback');
      const fbTopic = document.getElementById('fbTopic');
      const fbText = document.getElementById('fbText');
      const fbName = document.getElementById('fbName');
      const fbStatus = document.getElementById('fbStatus');
      const fbSend = document.getElementById('fbSend');
      // Zwei Modi im selben Formular: 'verbesserung' (Standard) und 'stoerung'
      // (aus dem Rechtsklick einer App). Bei einer Stoerung ist die Frage nach
      // dem normalen Browser PFLICHT - genau diese eine Antwort trennt einen
      // Verti-Fehler von einer Aenderung beim App-Anbieter.
      let fbModus = 'verbesserung';
      let fbBrowserAntwort = '';
      const fbTitel = document.getElementById('fbTitel');
      const fbSub = document.getElementById('fbSub');
      const fbFrage = document.getElementById('fbBrowserFrage');
      const fbSeg = document.getElementById('fbSegBrowser');
      fbSeg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        fbBrowserAntwort = b.dataset.v;
        fbSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      }));
      function openFeedback(modus, appDef) {
        fbModus = modus === 'stoerung' ? 'stoerung' : 'verbesserung';
        fbBrowserAntwort = '';
        fbSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        if (fbModus === 'stoerung') {
          fbTitel.textContent = 'Diese App funktioniert nicht';
          fbSub.textContent = 'Beschreib kurz, was passiert. Geht direkt an Freddy.';
          fbFrage.style.display = '';
          fbTopic.value = appDef && appDef.name ? appDef.name : '';
        } else {
          fbTitel.textContent = 'Verbesserung vorschlagen';
          fbSub.textContent = 'Was koennen wir an Verti besser machen? Geht direkt an Freddy.';
          fbFrage.style.display = 'none';
        }
        fbStatus.className = 'fbstatus'; fbStatus.textContent = '';
        fbSend.disabled = false; fbSend.textContent = 'Absenden';
        fbModal.classList.add('open');
        window.verti.openLibrary(); // App-Views ausblenden, sonst liegt das Formular dahinter
        applyNavState();
        setTimeout(() => (fbModus === 'stoerung' ? fbText : fbTopic).focus(), 50);
      }
      window.verti.onReportAppProblem((appDef) => openFeedback('stoerung', appDef));
      function closeFeedback() {
        fbModal.classList.remove('open');
        window.verti.closeLibrary();
        applyNavState();
      }
      async function submitFeedback() {
        const topic = fbTopic.value.trim();
        const description = fbText.value.trim();
        if (!topic || !description) { fbStatus.className = 'fbstatus err'; fbStatus.textContent = 'Bitte Thema und Beschreibung ausfuellen.'; return; }
        if (fbModus === 'stoerung' && !fbBrowserAntwort) {
          fbStatus.className = 'fbstatus err';
          fbStatus.textContent = 'Bitte beantworte, ob es im normalen Browser geht.';
          return;
        }
        fbSend.disabled = true; fbSend.textContent = 'Sende \u2026'; fbStatus.className = 'fbstatus'; fbStatus.textContent = '';
        try {
          // Die Zusatzinfos wandern in Thema/Beschreibung, damit keine
          // Datenbank-Aenderung noetig ist. Eigene Spalten waeren spaeter schoener.
          const antwortText = { ja: 'JA - im normalen Browser geht es', nein: 'NEIN - auch im normalen Browser nicht', unbekannt: 'nicht probiert' }[fbBrowserAntwort];
          const res = await window.verti.sendFeedback({
            topic: fbModus === 'stoerung' ? 'Stoerung: ' + topic : topic,
            description: fbModus === 'stoerung' ? 'Im normalen Browser: ' + antwortText + '\n\n' + description : description,
            sender: fbName.value.trim(),
          });
          if (res && res.ok) {
            fbStatus.className = 'fbstatus ok'; fbStatus.textContent = 'Danke! Ist angekommen.';
            fbTopic.value = ''; fbText.value = ''; fbName.value = '';
            setTimeout(closeFeedback, 1200);
          } else {
            fbSend.disabled = false; fbSend.textContent = 'Absenden';
            fbStatus.className = 'fbstatus err'; fbStatus.textContent = (res && res.error) || 'Konnte nicht senden.';
          }
        } catch (err) {
          fbSend.disabled = false; fbSend.textContent = 'Absenden';
          fbStatus.className = 'fbstatus err'; fbStatus.textContent = 'Konnte nicht senden.';
        }
      }
      document.getElementById('feedbackBtn').addEventListener('click', () => openFeedback('verbesserung'));
      document.getElementById('fbClose').addEventListener('click', closeFeedback);
      fbModal.addEventListener('click', (e) => { if (e.target === fbModal) closeFeedback(); });
      fbSend.addEventListener('click', submitFeedback);
      fbModal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFeedback();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitFeedback();
      });
      document.getElementById('closeLib').addEventListener('click', () => closeLibrary(true));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && library.classList.contains('open')) closeLibrary(true);
      });

      // ---------- Einstellungen (Zahnrad oben rechts) ----------
      function applyTheme(t, farbe) {
        if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        if (farbe) document.documentElement.setAttribute('data-farbe', farbe);
      }
      function markSeg(segId, val) {
        document.querySelectorAll('#' + segId + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === val));
      }
      function renderNotifList(muted) {
        const list = document.getElementById('notifList');
        list.innerHTML = '';
        const mutedSet = new Set(muted || []);
        for (const app of apps.filter((a) => a.id !== 'browser')) {
          const row = document.createElement('div'); row.className = 'notifrow';
          const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = app.name;
          const sw = document.createElement('label'); sw.className = 'switch';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !mutedSet.has(app.id);
          const track = document.createElement('span'); track.className = 'track';
          const knob = document.createElement('span'); knob.className = 'knob';
          cb.addEventListener('change', () => window.verti.setAppMuted(app.id, !cb.checked));
          sw.append(cb, track, knob);
          row.append(nm, sw); list.appendChild(row);
        }
      }
      async function openSettings() {
        const cur = await window.verti.getSettings();
        markSeg('segTheme', cur.theme);
        markSeg('segLinks', cur.externalLinks);
        baueFarbwahl(document.getElementById('farbWahl'), cur.themeColor, cur.farbwelten);
        renderNotifList(cur.mutedApps);
        library.classList.remove('open');
        settingsEl.classList.add('open');
        resetUpd();
        applyNavState();
        window.verti.openLibrary(); // App-Views ausblenden, damit das Overlay sichtbar ist
      }
      function closeSettings(notify) {
        settingsEl.classList.remove('open');
        applyNavState();
        if (notify) window.verti.closeLibrary();
      }
      document.getElementById('settingsBtn').addEventListener('click', openSettings);
      document.getElementById('closeSettings').addEventListener('click', () => closeSettings(true));
      document.querySelectorAll('#segTheme button').forEach((b) => b.addEventListener('click', () => {
        markSeg('segTheme', b.dataset.v); applyTheme(b.dataset.v); window.verti.setTheme(b.dataset.v);
      }));
      document.querySelectorAll('#segLinks button').forEach((b) => b.addEventListener('click', () => {
        markSeg('segLinks', b.dataset.v); window.verti.setExternalLinks(b.dataset.v);
      }));
      window.verti.onTheme(applyTheme);
      const checkBtn = document.getElementById('checkUpd');
      const updStatus = document.getElementById('updStatus');
      let updMode = 'check';
      function resetUpd() { updMode = 'check'; checkBtn.textContent = 'Nach Updates suchen'; checkBtn.disabled = false; updStatus.textContent = 'Installierte Version von Verti'; }
      checkBtn.addEventListener('click', async () => {
        if (updMode === 'update') { window.verti.openUpdatePopup(); return; }
        checkBtn.disabled = true; updStatus.textContent = 'Suche nach Updates…';
        const r = await window.verti.checkUpdates();
        checkBtn.disabled = false;
        if (r.status === 'available') { updStatus.textContent = 'Update ' + r.version + ' verfügbar'; checkBtn.textContent = 'Jetzt aktualisieren'; updMode = 'update'; }
        else if (r.status === 'dev') updStatus.textContent = 'Update-Suche nur in der installierten App';
        else if (r.status === 'current') updStatus.textContent = 'Du hast die neueste Version';
        else updStatus.textContent = 'Suche fehlgeschlagen – später erneut versuchen';
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsEl.classList.contains('open')) closeSettings(true);
      });

      const customUrl = document.getElementById('customUrl');
      function addCustom() {
        let value = customUrl.value.trim();
        if (!value) return;
        if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
        try {
          const url = new URL(value);
          const id = 'custom-' + url.hostname.replace(/\W/g, '-');
          const name = url.hostname.replace(/^www\./, '');
          window.verti.addApp({ id, name, url: url.href });
          customUrl.value = '';
        } catch {}
      }
      document.getElementById('customAdd').addEventListener('click', addCustom);
      customUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustom(); });

      window.verti.onActiveApp((id) => {
        activeId = id;
        closeLibrary(false);
        settingsEl.classList.remove('open');
        refreshActive();
      });
      // Das erste 'active-app' kann vor der Registrierung oben gekommen sein
      // (Wettlauf beim Laden) → aktuellen Stand einmal abholen
      const currentActive = await window.verti.getActiveApp();
      if (currentActive && !activeId) {
        activeId = currentActive;
        refreshActive();
      }

      window.verti.onAppsChanged((newApps) => {
        apps = newApps;
        renderSidebar();
        if (library.classList.contains('open')) renderCatalog();
      });

      // Windows hat kein Dock-Badge: Gesamtzahl als rotes Overlay
      // aufs Taskleisten-Icon malen und an den Hauptprozess schicken
      function updateOverlay() {
        if (isMac) return;
        const total = Object.values(badgeCounts).reduce((a, b) => a + b, 0);
        if (!total) {
          window.verti.setOverlay(null, 0);
          return;
        }
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(16, 16, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + (total > 99 ? 14 : 18) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total > 99 ? '99+' : String(total), 16, 17);
        window.verti.setOverlay(c.toDataURL(), total);
      }

      window.verti.onAudio((a) => {
        audioStates = a;
        refreshPlaying();
      });
      window.verti.onBadges((b) => {
        badgeCounts = b;
        refreshBadges();
        updateOverlay();
      });

      const updatePill = document.getElementById('updatePill');
      updatePill.addEventListener('click', () => window.verti.openUpdatePopup());
      window.verti.onUpdatePill(() => updatePill.classList.add('show'));
      if (await window.verti.getPendingUpdate()) updatePill.classList.add('show');

      renderSidebar();
      updateOverlay();
    })();
  