/* Sealed Fortunes
   Everything is stored on the person's own device (IndexedDB). No server, no accounts. */
(() => {
  'use strict';

  /* ---------- The generic half of every fortune ----------
     Deliberately open-ended: the reader supplies the specific half. */
  const LINES = [
    'A small door opens when you stop pushing.',
    'Something you set down will find its way back to you.',
    'The soft thing is stronger than it looks.',
    'You will soon be asked to choose between two good things.',
    'Patience is a kind of attention.',
    'What you are carrying is lighter than you think.',
    'An old kindness is on its way back to you.',
    'Today’s ordinary moment will be remembered later.',
    'The next turn is wider than the last.',
    'Someone is thinking of you fondly and has not said so.',
    'A thing that bends does not break.',
    'You are allowed to begin before you are ready.',
    'Listen for the quiet part of the sentence.',
    'Good weather is coming, and it is also already here.',
    'What feels unfinished is only still growing.',
    'A small gesture from a stranger will matter more than expected.',
    'You already know the next step. It is the smaller one.',
    'Rest is also a way of moving.',
    'Not every question needs its answer today.',
    'The thing you worry about will arrive smaller than it left.',
    'Your attention is the rarest thing you can give.',
    'A table with room for one more is a good table.',
    'What you keep close keeps you.',
    'Be curious about what surprises you.',
    'A crooked path still reaches the river.',
    'Something sweet is closer than the clock suggests.',
    'You will be glad you wrote it down.',
    'Unclench. The day is not a fist.',
    'A small ritual can hold a large day.',
    'The best part is the part you almost skipped.',
    'Make room. Something is arriving.',
    'You are more in tune than you believe.',
    'Meet the unknown the way you meet a friend: with a little warmth first.',
    'Not knowing is a place, and it has good light.',
    'What you remember is also what you are making.',
    'Today’s luck is yours to interpret.'
  ];

  /* ---------- tiny helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = () =>
    (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const fmtDate = (ts) =>
    new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const pickLine = () => LINES[Math.floor(Math.random() * LINES.length)];

  /* ---------- storage (IndexedDB, with an in-memory fallback) ---------- */
  const DB_NAME = 'sealed-fortunes';
  const STORE = 'fortunes';
  let dbPromise = null;
  let memoryOnly = false;
  const memoryStore = new Map();

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB unavailable')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    return dbPromise;
  }

  async function dbAll() {
    if (memoryOnly) return Array.from(memoryStore.values());
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  async function dbPut(item) {
    if (memoryOnly) { memoryStore.set(item.id, item); return; }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(item);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    });
  }

  async function dbDelete(id) {
    if (memoryOnly) { memoryStore.delete(id); return; }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  /* ---------- state ---------- */
  let items = [];
  let lastAddedId = null;
  const sealed = () => items.filter((i) => !i.openedAt).sort((a, b) => a.createdAt - b.createdAt);
  const opened = () => items.filter((i) => i.openedAt).sort((a, b) => b.openedAt - a.openedAt);

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg, ms = 2800) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /* ---------- the jar ---------- */
  // Cookies are the illustrated cookie, piled inside the illustrated jar.
  // Positions are fractions of the jar image, so the pile scales with the jar.
  const COOKIE_W = 0.37;                 // cookie width as a fraction of jar width
  const COOKIE_H = COOKIE_W * 0.5275 * 0.922; // ...and as a fraction of jar height
  const SLOTS = (() => {
    // Deterministic "random" so the pile looks the same every visit.
    let s = 11;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const xs = [0.37, 0.55, 0.71];
    const order = [1, 0, 2]; // fill the middle of each row first so the pile grows evenly
    const out = [];
    for (let row = 0; row < 5; row++) {
      for (const col of order) {
        out.push({
          x: xs[col] + (row % 2 ? -0.03 : 0.03) + (rnd() - .5) * 0.04,
          y: 0.80 - row * 0.062 + (rnd() - .5) * 0.014,
          r: (rnd() - .5) * 60,
          flip: rnd() > 0.5,
          hue: Math.round((rnd() - .5) * 18)
        });
      }
    }
    return out;
  })();

  function renderJar() {
    const list = sealed();
    const shown = list.slice(0, SLOTS.length);
    const cookies = shown.map((it, i) => {
      const p = SLOTS[i];
      const left = ((p.x - COOKIE_W / 2) * 100).toFixed(2);
      const top = ((p.y - COOKIE_H / 2) * 100).toFixed(2);
      const cls = it.id === lastAddedId ? ' drop' : '';
      return `<img class="jar-cookie${cls}" src="img/cookie-sm.webp" alt="" style="left:${left}%;top:${top}%;--hue:${p.hue}deg;transform:rotate(${p.r.toFixed(1)}deg) scaleX(${p.flip ? -1 : 1})">`;
    }).join('');

    const n = list.length;
    $('#jar').innerHTML =
      `<div class="jar-wrap" role="img" aria-label="A jar holding ${n} sealed fortune ${n === 1 ? 'cookie' : 'cookies'}">` +
      `<img class="jar-img" src="img/jar.webp" alt="">${cookies}</div>`;

    $('#jar-count').textContent =
      n === 0 ? (opened().length ? 'Every fortune is opened. Seal a new good day.' : 'The jar is empty. Seal your first good day.')
        : n === 1 ? '1 fortune sealed'
          : `${n} fortunes sealed`;

    // Lead with whichever action makes sense right now.
    const draw = $('#btn-draw');
    const add = $('#btn-add');
    draw.disabled = n === 0;
    draw.className = n > 0 ? 'btn' : 'btn secondary';
    add.className = n > 0 ? 'btn secondary' : 'btn';
    if (n > 0) { draw.style.order = '0'; add.style.order = '1'; }
    else { add.style.order = '0'; draw.style.order = '1'; }

    if (lastAddedId) {
      $('.jar-wrap').classList.add('jiggle');
      lastAddedId = null;
    }
  }

  /* ---------- opened fortunes list ---------- */
  function renderOpened() {
    const list = opened();
    const ul = $('#opened-list');
    ul.textContent = '';
    list.forEach((it) => {
      const li = document.createElement('li');
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'opened-card';
      card.setAttribute('aria-label', 'Read this fortune again');

      if (it.kind === 'photo' && it.photo) {
        const img = document.createElement('img');
        img.className = 'opened-thumb';
        img.alt = '';
        img.src = it.photo;
        card.appendChild(img);
      } else {
        const g = document.createElement('div');
        g.className = 'opened-glyph';
        g.setAttribute('aria-hidden', 'true');
        const cimg = document.createElement('img');
        cimg.src = 'img/cookie-sm.webp';
        cimg.alt = '';
        g.appendChild(cimg);
        card.appendChild(g);
      }

      const meta = document.createElement('div');
      meta.className = 'opened-meta';
      const text = document.createElement('p');
      text.className = 'opened-text';
      text.textContent = it.kind === 'photo' ? (it.caption || 'A photo you sealed') : it.text;
      const line = document.createElement('p');
      line.className = 'opened-line';
      line.textContent = it.line;
      const date = document.createElement('p');
      date.className = 'opened-date';
      date.textContent = `Opened ${fmtDate(it.openedAt)}`;
      meta.append(text, line, date);
      card.appendChild(meta);

      card.addEventListener('click', () => openStage(it, 'review'));
      li.appendChild(card);
      ul.appendChild(li);
    });

    $('#opened-empty').hidden = list.length > 0;
    const badge = $('#opened-badge');
    badge.hidden = list.length === 0;
    badge.textContent = list.length;
  }

  const renderAll = () => { renderJar(); renderOpened(); };

  /* ---------- tabs ---------- */
  function setView(name) {
    const jar = name === 'jar';
    $('#view-jar').hidden = !jar;
    $('#view-opened').hidden = jar;
    if (jar) { $('#tab-jar').setAttribute('aria-current', 'page'); $('#tab-opened').removeAttribute('aria-current'); }
    else { $('#tab-opened').setAttribute('aria-current', 'page'); $('#tab-jar').removeAttribute('aria-current'); }
    window.scrollTo(0, 0);
  }
  $('#tab-jar').addEventListener('click', () => setView('jar'));
  $('#tab-opened').addEventListener('click', () => setView('opened'));

  /* ---------- add sheet ---------- */
  const sheetBackdrop = $('#sheet-backdrop');
  const sheet = $('#sheet');
  const memoryText = $('#memory-text');
  const photoInput = $('#photo-input');
  const photoPreview = $('#photo-preview');
  const photoPrompt = $('#photo-prompt');
  const caption = $('#caption');
  const sealBtn = $('#seal-btn');
  let sheetMode = 'write';
  let photoData = null;
  let sheetOpener = null;

  function setSheetMode(mode) {
    sheetMode = mode;
    $$('.seg button', sheet).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $$('.pane', sheet).forEach((p) => { p.hidden = p.dataset.pane !== mode; });
    updateSealEnabled();
  }
  function updateSealEnabled() {
    sealBtn.disabled = sheetMode === 'write' ? memoryText.value.trim().length === 0 : !photoData;
  }
  function resetSheet() {
    memoryText.value = '';
    $('#memory-count').textContent = '0';
    caption.value = '';
    photoData = null;
    photoInput.value = '';
    photoPreview.hidden = true;
    photoPreview.removeAttribute('src');
    photoPrompt.hidden = false;
    $('.photo-drop').classList.remove('has-photo');
    setSheetMode('write');
  }
  function openSheet() {
    sheetOpener = document.activeElement;
    resetSheet();
    sheetBackdrop.hidden = false;
    document.body.classList.add('no-scroll');
    setTimeout(() => memoryText.focus(), 50);
  }
  function closeSheet() {
    sheetBackdrop.hidden = true;
    document.body.classList.remove('no-scroll');
    if (sheetOpener && sheetOpener.focus) sheetOpener.focus();
  }

  $('#btn-add').addEventListener('click', openSheet);
  $$('[data-close]', sheet).forEach((b) => b.addEventListener('click', closeSheet));
  sheetBackdrop.addEventListener('click', (e) => { if (e.target === sheetBackdrop) closeSheet(); });
  $$('.seg button', sheet).forEach((b) => b.addEventListener('click', () => setSheetMode(b.dataset.mode)));
  memoryText.addEventListener('input', () => {
    $('#memory-count').textContent = memoryText.value.length;
    updateSealEnabled();
  });

  async function fileToJpeg(file, max = 1200) {
    let bmp;
    if ('createImageBitmap' in window) {
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { bmp = null; }
    }
    if (!bmp) {
      bmp = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
        img.src = url;
      });
    }
    const sw = bmp.naturalWidth || bmp.width;
    const sh = bmp.naturalHeight || bmp.height;
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    try {
      photoData = await fileToJpeg(file);
      photoPreview.src = photoData;
      photoPreview.hidden = false;
      photoPrompt.hidden = true;
      $('.photo-drop').classList.add('has-photo');
    } catch (err) {
      photoData = null;
      toast('That photo could not be read. Try another one.');
    }
    updateSealEnabled();
  });

  sheet.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sealBtn.disabled) return;
    const base = { id: uid(), line: pickLine(), createdAt: Date.now(), openedAt: null };
    const item = sheetMode === 'write'
      ? { ...base, kind: 'text', text: memoryText.value.trim() }
      : { ...base, kind: 'photo', photo: photoData, caption: caption.value.trim() };
    sealBtn.disabled = true;
    try {
      await dbPut(item);
    } catch (err) {
      toast('Could not save on this device. Check that storage is allowed.');
      updateSealEnabled();
      return;
    }
    items.push(item);
    lastAddedId = item.id;
    closeSheet();
    setView('jar');
    renderAll();
    toast('Sealed. It is in the jar.');
  });

  /* ---------- the stage ---------- */
  let activeStage = null;

  function fillPaper(paper, item, mode) {
    $('.paper-line', paper).textContent = `“${item.line}”`;
    const slot = $('.paper-memory-slot', paper);
    slot.textContent = '';
    if (item.kind === 'photo' && item.photo) {
      const fig = document.createElement('figure');
      fig.className = 'paper-photo';
      const img = document.createElement('img');
      img.src = item.photo;
      img.alt = item.caption || 'A photo you sealed';
      fig.appendChild(img);
      if (item.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = item.caption;
        fig.appendChild(cap);
      }
      slot.appendChild(fig);
    } else {
      const p = document.createElement('p');
      p.className = 'paper-memory';
      p.textContent = item.text;
      slot.appendChild(p);
    }
    const sealedOn = `Sealed ${fmtDate(item.createdAt)}`;
    const openedOn = mode === 'draw' ? 'opened today' : `opened ${fmtDate(item.openedAt)}`;
    $('.paper-date', paper).textContent = `${sealedOn} · ${openedOn}`;
  }

  function openStage(item, mode) {
    if (activeStage) return;
    const opener = document.activeElement;
    const root = document.createElement('div');
    root.className = 'stage';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', mode === 'draw' ? 'Opening a fortune cookie' : 'A fortune you opened');
    root.dataset.mode = mode;
    root.dataset.phase = mode === 'draw' ? 'idle' : 'review';
    root.innerHTML = `
      <button class="stage-close" type="button" aria-label="Close">×</button>
      <p class="stage-hint">Press and hold to crack it open</p>
      <button class="cookie" type="button" aria-label="Fortune cookie. Press and hold, or press Enter, to crack it open.">
        <span class="cookie-inner">
          <img class="half half-l" src="img/cookie.webp" alt="">
          <img class="half half-r" src="img/cookie.webp" alt="">
        </span>
      </button>
      <div class="paper" data-state="rolled">
        <div class="paper-body"><div class="paper-clip"><div class="paper-scroll" tabindex="0">
          <p class="paper-kicker">Your fortune</p>
          <p class="paper-line"></p>
          <div class="paper-rule"><span>which, for you, means</span></div>
          <div class="paper-memory-slot"></div>
          <p class="paper-date"></p>
        </div></div></div>
        <div class="paper-roll"></div>
      </div>
      <div class="stage-actions"></div>`;

    document.body.appendChild(root);
    document.body.classList.add('no-scroll');
    activeStage = root;

    const paper = $('.paper', root);
    const cookie = $('.cookie', root);
    const actions = $('.stage-actions', root);
    fillPaper(paper, item, mode);

    function close() {
      root.remove();
      activeStage = null;
      document.body.classList.remove('no-scroll');
      if (opener && opener.focus && document.contains(opener)) opener.focus();
    }
    root.close = close;
    $('.stage-close', root).addEventListener('click', close);

    function addButton(label, cls, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', onClick);
      actions.appendChild(b);
      return b;
    }

    function buildActions() {
      actions.textContent = '';
      addButton(mode === 'draw' ? 'Back to the jar' : 'Done', '', () => {
        close();
        setView(mode === 'draw' ? 'jar' : 'opened');
      });
      addButton('Seal it back in the jar', 'secondary', async () => {
        item.openedAt = null;
        try { await dbPut(item); } catch (e) { /* kept in memory state below */ }
        close();
        lastAddedId = item.id;
        setView('jar');
        renderAll();
        toast('Back in the jar.');
      });
      if (mode === 'review') {
        addButton('Delete this fortune', 'quiet', async () => {
          if (!window.confirm('Delete this fortune for good?')) return;
          try { await dbDelete(item.id); } catch (e) { /* ignore */ }
          items = items.filter((x) => x.id !== item.id);
          close();
          renderAll();
          toast('Deleted.');
        });
      }
      actions.classList.add('show');
      const first = $('.btn', actions);
      if (first) first.focus({ preventScroll: true });
    }

    if (mode === 'review') {
      paper.dataset.state = 'wide';
      requestAnimationFrame(() => requestAnimationFrame(() => { paper.dataset.state = 'open'; }));
      wait(reduceMotion() ? 50 : 1300).then(buildActions);
      return;
    }

    /* draw mode: hold to crack */
    let cracked = false;
    let holdTimer = null;
    const HOLD_MS = 900;

    function cancelHold() {
      clearTimeout(holdTimer);
      cookie.classList.remove('holding');
    }

    async function crack() {
      if (cracked) return;
      cracked = true;
      cancelHold();
      root.dataset.phase = 'cracked';
      if (navigator.vibrate) { try { navigator.vibrate([30, 40, 60]); } catch (e) { /* ignore */ } }

      item.openedAt = Date.now();
      try { await dbPut(item); } catch (e) { toast('Opened, but could not save it to Opened Fortunes.'); }
      renderAll();
      $('.paper-date', paper).textContent = `Sealed ${fmtDate(item.createdAt)} · opened today`;

      if (reduceMotion()) {
        root.dataset.phase = 'gone';
        paper.dataset.state = 'open';
        await wait(100);
        buildActions();
        return;
      }
      await wait(380);
      paper.dataset.state = 'rise';
      await wait(900);
      root.dataset.phase = 'gone';
      paper.dataset.state = 'wide';
      await wait(520);
      paper.dataset.state = 'open';
      await wait(1900);
      buildActions();
    }

    cookie.addEventListener('pointerdown', (e) => {
      if (cracked) return;
      e.preventDefault();
      try { cookie.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (reduceMotion()) { crack(); return; }
      cookie.classList.add('holding');
      clearTimeout(holdTimer);
      holdTimer = setTimeout(crack, HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
      cookie.addEventListener(ev, () => { if (!cracked) cancelHold(); }));
    cookie.addEventListener('contextmenu', (e) => e.preventDefault());
    cookie.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); crack(); }
    });
    setTimeout(() => cookie.focus({ preventScroll: true }), 100);
  }

  function drawOne() {
    const list = sealed();
    if (list.length === 0) {
      if (opened().length > 0) toast('Every fortune is opened. Seal a new memory, or put one back from Opened Fortunes.', 4200);
      else toast('Nothing sealed yet. Seal a memory first.');
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    openStage(pick, 'draw');
  }
  $('#btn-draw').addEventListener('click', drawOne);

  /* ---------- backup and restore ---------- */
  $('#btn-export').addEventListener('click', () => {
    if (items.length === 0) { toast('Nothing to back up yet.'); return; }
    const data = { app: 'sealed-fortunes', version: 1, exportedAt: Date.now(), fortunes: items };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sealed-fortunes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Backup saved to your downloads.');
  });

  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'sealed-fortunes' || !Array.isArray(data.fortunes)) throw new Error('bad file');
      const have = new Set(items.map((i) => i.id));
      let added = 0;
      for (const f of data.fortunes) {
        const ok = f && typeof f.id === 'string' && typeof f.createdAt === 'number' && typeof f.line === 'string' &&
          ((f.kind === 'text' && typeof f.text === 'string') ||
           (f.kind === 'photo' && typeof f.photo === 'string' && f.photo.startsWith('data:image/')));
        if (!ok || have.has(f.id)) continue;
        const clean = {
          id: f.id, kind: f.kind, line: f.line, createdAt: f.createdAt,
          openedAt: typeof f.openedAt === 'number' ? f.openedAt : null,
          text: f.kind === 'text' ? f.text.slice(0, 500) : undefined,
          photo: f.kind === 'photo' ? f.photo : undefined,
          caption: f.kind === 'photo' && typeof f.caption === 'string' ? f.caption.slice(0, 120) : undefined
        };
        await dbPut(clean);
        items.push(clean);
        added++;
      }
      renderAll();
      toast(added ? `Restored ${added} ${added === 1 ? 'fortune' : 'fortunes'}.` : 'Nothing new to restore.');
    } catch (err) {
      toast('That file does not look like a Sealed Fortunes backup.');
    }
  });

  /* ---------- install nudge ---------- */
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredPrompt = null;

  function tipDismissed() { try { return localStorage.getItem('sf-tip-dismissed') === '1'; } catch (e) { return false; } }
  function showTip() {
    if (isStandalone() || tipDismissed()) return;
    const tip = $('#install-tip');
    const text = $('#install-text');
    if (isIOS()) {
      text.textContent = 'Add this to your home screen before you seal anything: tap Share, then Add to Home Screen, and open it from there. On iPhone the home screen app keeps its own jar, separate from Safari.';
    } else if (deferredPrompt) {
      text.textContent = 'Install this on your home screen before you seal anything, so your jar is always one tap away.';
      $('#btn-install').hidden = false;
    } else {
      text.textContent = 'For a jar that is always one tap away, add this page to your home screen from your browser menu, then open it from there.';
    }
    tip.hidden = false;
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showTip();
  });
  window.addEventListener('appinstalled', () => { $('#install-tip').hidden = true; deferredPrompt = null; });
  $('#btn-install').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ }
    deferredPrompt = null;
    $('#install-tip').hidden = true;
  });
  $('#btn-tip-dismiss').addEventListener('click', () => {
    $('#install-tip').hidden = true;
    try { localStorage.setItem('sf-tip-dismissed', '1'); } catch (e) { /* ignore */ }
  });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (activeStage && activeStage.close) activeStage.close();
    else if (!sheetBackdrop.hidden) closeSheet();
  });

  /* ---------- start ---------- */
  async function init() {
    try {
      items = await dbAll();
    } catch (err) {
      memoryOnly = true;
      items = [];
      toast('This browser is not letting the app save. Your jar will only last until you close this page.', 6000);
    }
    renderAll();
    showTip();
    // Ask the browser to keep our data when storage is tight. Safe to ignore if refused.
    if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }
  }
  init();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
