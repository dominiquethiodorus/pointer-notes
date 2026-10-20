// Pointer Notes content script (isolated world). Re-injecting toggles the overlay.
(() => {
  if (window.__pn) { window.__pn.toggle(); return; }

  const STORE_KEY = 'pn:' + location.origin + location.pathname;
  const STYLE_PROPS = ['color', 'background-color', 'font-size', 'font-weight', 'font-family', 'line-height',
    'padding', 'margin', 'border', 'border-radius', 'display', 'width', 'height'];

  let active = false;
  let annotations = [];
  let hovered = null;
  let popover = null;
  let skipClick = false;
  let drag = null;
  let mode = 'element';
  let shiftDown = false;
  let lastClick = { x: 0, y: 0 };
  const pending = new Set();
  let focusEl = null;     // element currently targeted in element mode (may differ from the hovered one)
  let hoverBase = null;   // element actually under the mouse
  let lastMouse = { x: 0, y: 0 };
  const stepStack = [];   // elements we climbed out of, so ArrowDown can return to them
  const cursorStyle = document.createElement('style');

  // ---------- UI shell (shadow DOM keeps page CSS out) ----------
  const host = document.createElement('div');
  host.id = 'pn-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host{all:initial}
      *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .hl{position:fixed;border:2px solid #6366f1;background:rgba(99,102,241,.12);border-radius:3px;display:none;pointer-events:none}
      .box{position:fixed;border:1.5px dashed #6366f1;background:rgba(99,102,241,.08);display:none;pointer-events:none;border-radius:2px}
      .multi div{position:fixed;border:1.5px solid #6366f1;background:rgba(99,102,241,.14);border-radius:3px;pointer-events:none}
      .tag{position:fixed;background:#312e81;color:#fff;font:11px/1.35 ui-monospace,Menlo,monospace;padding:4px 7px;border-radius:5px;display:none;pointer-events:none;max-width:70vw}
      .tag .t1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tag .t2{display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:3px;color:#c7d2fe}
      .tag .t2 span{white-space:nowrap}
      .tag .sw{display:inline-block;width:9px;height:9px;border-radius:2px;border:1px solid rgba(255,255,255,.6);vertical-align:-1px;margin-right:4px}
      .bar{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:2px;background:#18181b;color:#fff;border-radius:999px;padding:5px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:auto;font-size:13px}
      .bar button{all:unset;cursor:pointer;padding:7px 12px;border-radius:999px;font-size:13px;color:#e4e4e7}
      .bar button:hover{background:#3f3f46;color:#fff}
      .bar .count{padding:7px 10px;color:#a1a1aa;font-variant-numeric:tabular-nums}
      .bar .primary{background:#4f46e5;color:#fff}.bar .primary:hover{background:#6366f1}
      .m{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:#4f46e5;color:#fff;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff}
      .m:hover{transform:scale(1.15)}
      .pop{position:fixed;width:300px;background:#fff;color:#18181b;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.3);padding:12px;pointer-events:auto;font-size:13px}
      .pop .meta{font:11px/1.4 ui-monospace,Menlo,monospace;color:#52525b;margin-bottom:8px;word-break:break-all;white-space:pre-wrap;max-height:90px;overflow:auto}
      .pop .sel{background:#fef9c3;border-left:3px solid #eab308;padding:4px 8px;margin-bottom:8px;font-size:12px;border-radius:0 4px 4px 0;max-height:60px;overflow:auto}
      .pop .grab{height:16px;margin:-8px -4px 2px;cursor:grab;display:flex;align-items:center;justify-content:center;touch-action:none;user-select:none}
      .pop .grab::before{content:'';width:34px;height:4px;border-radius:2px;background:#d4d4d8}
      .pop .grab:hover::before{background:#a1a1aa}
      .pop.dragging .grab,.pop.dragging .meta{cursor:grabbing}
      .pop .meta{cursor:grab;user-select:none}
      .pop textarea{width:100%;height:76px;resize:vertical;border:1px solid #d4d4d8;border-radius:8px;padding:8px;font-size:13px;outline:none}
      .pop textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.2)}
      .pop .row{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
      .pop button{all:unset;cursor:pointer;padding:6px 12px;border-radius:8px;font-size:13px;background:#f4f4f5;color:#27272a}
      .pop button:hover{background:#e4e4e7}
      .pop .save{background:#4f46e5;color:#fff}.pop .save:hover{background:#6366f1}
      .pop .del{margin-right:auto;color:#dc2626}
      .m.g{background:#16a34a}
      .ar{position:fixed;border:1.5px dashed #16a34a;background:rgba(22,163,74,.07);border-radius:2px;pointer-events:none}
      .bar{cursor:default}.pop{cursor:default}.pop textarea{cursor:text}
      .bar .mode.on{background:#3f3f46;color:#fff}
      .bar kbd{font:10px/1 ui-monospace,Menlo,monospace;color:#a1a1aa;border:1px solid #52525b;border-radius:4px;padding:1px 4px;margin-left:4px}
      .bar .sep{width:1px;height:18px;background:#3f3f46;margin:0 4px}
      .hint{position:fixed;right:16px;bottom:70px;background:#312e81;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;display:none;pointer-events:none}
      .hint.on{display:block}
      .toast{position:fixed;right:16px;bottom:70px;background:#18181b;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
      .toast.on{opacity:1}
    </style>
    <div class="hl"></div><div class="box"></div><div class="multi"></div><div class="tag"></div>
    <div class="markers"></div>
    <div class="bar">
      <button data-m="element" class="mode on" title="Element select (V) · hold Shift to multi-select · ↑/↓ for parent/child">Element<kbd>V</kbd></button>
      <button data-m="text" class="mode" title="Text select (T)">Text<kbd>T</kbd></button>
      <button data-m="area" class="mode" title="Area select (A)">Area<kbd>A</kbd></button>
      <span class="sep"></span>
      <span class="count">0 notes</span>
      <button data-a="copy" class="primary">Copy</button>
      <button data-a="vis" title="Show/hide markers">Markers</button>
      <button data-a="clear">Clear</button>
      <button data-a="close" title="Close (Esc)">✕</button>
    </div>
    <div class="hint"></div><div class="toast"></div>`;
  const $ = (s) => root.querySelector(s);
  const hl = $('.hl'), boxEl = $('.box'), multiEl = $('.multi'), tagEl = $('.tag'), markersEl = $('.markers'), bar = $('.bar'), toastEl = $('.toast'), hintEl = $('.hint');
  let markersVisible = true;

  // ---------- helpers ----------
  const inUI = (el) => el === host || host.contains(el);
  const esc = (s) => CSS.escape(s);
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    setTimeout(() => toastEl.classList.remove('on'), 1600);
  }

  function goodClasses(el) {
    return [...el.classList].filter((c) => !/\d{3,}|^css-|^(sc|jsx|svelte)-|^[a-z0-9]{1,2}$|^_|--[a-z0-9]{6,}/i.test(c)).slice(0, 2);
  }

  function segment(el) {
    const tag = el.tagName.toLowerCase();
    const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (tid) return `${tag}[data-testid="${tid}"]`;
    let s = tag + goodClasses(el).map((c) => '.' + esc(c)).join('');
    const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.tagName === el.tagName) : [];
    if (sibs.length > 1) s += `:nth-of-type(${sibs.indexOf(el) + 1})`;
    return s;
  }

  function selectorFor(el) {
    const parts = [];
    for (let cur = el; cur && cur.nodeType === 1 && cur !== document.documentElement; cur = cur.parentElement) {
      if (cur.id && !/\d{4,}/.test(cur.id) && document.querySelectorAll('#' + esc(cur.id)).length === 1) {
        parts.unshift('#' + esc(cur.id));
        break;
      }
      parts.unshift(segment(cur));
      if (parts.length >= 4) {
        const sel = parts.join(' > ');
        try { if (document.querySelectorAll(sel).length === 1) break; } catch (_) { /* keep climbing */ }
      }
      if (cur === document.body) break;
    }
    return parts.join(' > ');
  }

  function readableName(el) {
    const label = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText || el.textContent || '';
    return trunc(label.trim().replace(/\s+/g, ' '), 40);
  }

  async function frameworkInfo(el) {
    const id = String(Math.random()).slice(2);
    el.setAttribute('data-pn-probe', id);
    document.dispatchEvent(new CustomEvent('pn:probe', { detail: id }));
    const raw = el.getAttribute('data-pn-info');
    el.removeAttribute('data-pn-probe');
    el.removeAttribute('data-pn-info');
    try { return raw ? JSON.parse(raw) : {}; } catch (_) { return {}; }
  }

  function stylesFor(el) {
    const cs = getComputedStyle(el);
    return STYLE_PROPS.map((p) => `${p}: ${cs.getPropertyValue(p)}`).join('; ');
  }

  // ---------- persistence ----------
  const store = {
    load: () => new Promise((r) => chrome.storage.local.get(STORE_KEY, (o) => r((o[STORE_KEY] || []).map((a) => {
      if (!a.items) { a.items = [{ tag: a.tag, name: a.name, selector: a.selector, path: a.path, classes: a.classes, styles: a.styles, components: a.components || [], source: a.source || '' }]; }
      return a;
    })))),
    save: () => chrome.storage.local.set({ [STORE_KEY]: annotations }),
  };

  // ---------- markers ----------
  function anchorPoint(a) {
    let el = null;
    if (a.items.length === 1 && a.kind !== 'area') { try { el = document.querySelector(a.items[0].selector); } catch (_) { /* invalid selector */ } }
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + a.fx * r.width, y: r.top + a.fy * r.height };
    }
    return { x: a.px - scrollX, y: a.py - scrollY };
  }

  function renderMarkers() {
    markersEl.innerHTML = '';
    markersEl.style.display = markersVisible ? '' : 'none';
    annotations.forEach((a, i) => {
      if (a.kind === 'area') {
        const o = document.createElement('div');
        o.className = 'ar';
        Object.assign(o.style, { left: a.area.x - scrollX + 'px', top: a.area.y - scrollY + 'px', width: a.area.w + 'px', height: a.area.h + 'px' });
        markersEl.appendChild(o);
      }
      const m = document.createElement('div');
      m.className = 'm' + (a.items.length > 1 || a.kind === 'area' ? ' g' : '');
      m.textContent = i + 1;
      m.title = (a.kind === 'area' ? '[area] ' : a.items.length > 1 ? `[${a.items.length} elements] ` : '') + a.comment;
      const p = anchorPoint(a);
      m.style.left = p.x + 'px';
      m.style.top = p.y + 'px';
      m.addEventListener('click', (e) => { e.stopPropagation(); openPopover(a, p.x, p.y); });
      markersEl.appendChild(m);
    });
    bar.querySelector('.count').textContent = `${annotations.length} note${annotations.length === 1 ? '' : 's'}`;
  }

  let raf = 0;
  const reposition = () => {
    if (!active || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; renderMarkers(); });
  };

  // ---------- popover ----------
  function closePopover() { popover?.remove(); popover = null; clearTargets(); focusEl = hoverBase = null; }

  function clearTargets() { multiEl.innerHTML = ''; }
  function showTargets(els) {
    clearTargets();
    els.forEach((t) => {
      const r = t.getBoundingClientRect();
      const d = document.createElement('div');
      Object.assign(d.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      multiEl.appendChild(d);
    });
  }

  async function describe(el) {
    const fw = await frameworkInfo(el);
    return {
      tag: el.tagName.toLowerCase(), name: readableName(el), selector: selectorFor(el), path: pathFor(el),
      classes: [...el.classList].join(' '), styles: stylesFor(el), components: fw.components || [], source: fw.source || '',
    };
  }

  // existing: annotation being edited | targets: elements being annotated | selectedText: optional quote
  function openPopover(existing, x, y, targets, selectedText, areaBox, keepPos) {
    closePopover();
    const a = existing;
    const pop = document.createElement('div');
    pop.className = 'pop';
    const sel = a ? a.selectedText : selectedText;
    const items = a ? a.items : targets.map((t) => ({ tag: t.tagName.toLowerCase(), selector: selectorFor(t) }));
    const isArea = a ? a.kind === 'area' : !!areaBox;
    const dims = a ? a.area : areaBox && { w: areaBox.r - areaBox.l, h: areaBox.b - areaBox.t };
    const list = items.slice(0, 6).map((i) => `• ${i.selector}`).join('\n') + (items.length > 6 ? `\n… +${items.length - 6} more` : '');
    const meta = isArea
      ? `Area ${Math.round(dims.w)}×${Math.round(dims.h)}\n` + (items.length ? `${items.length} element${items.length > 1 ? 's' : ''} inside\n${list}` : 'no elements inside')
      : items.length === 1 ? `${items[0].tag} · ${items[0].selector}` : `${items.length} elements\n${list}`;
    pop.innerHTML = `<div class="grab" title="Drag to move"></div><div class="meta"></div>${sel ? '<div class="sel"></div>' : ''}
      <textarea placeholder="${isArea ? 'What should change in this area?' : items.length > 1 ? 'What should change across these elements?' : 'What should change here?'}"></textarea>
      <div class="row">${a ? '<button class="del">Delete</button>' : ''}<button class="cancel">Cancel</button><button class="save">${a ? 'Update' : 'Add'}</button></div>`;
    pop.querySelector('.meta').textContent = meta;
    if (sel) pop.querySelector('.sel').textContent = '“' + trunc(sel, 200) + '”';
    const ta = pop.querySelector('textarea');
    ta.value = a ? a.comment : '';
    pop.style.left = keepPos ? keepPos.left : Math.max(8, Math.min(x + 14, innerWidth - 316)) + 'px';
    pop.style.top = keepPos ? keepPos.top : Math.max(8, Math.min(y + 14, innerHeight - 260)) + 'px';
    for (const handle of pop.querySelectorAll('.grab, .meta')) {
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const r = pop.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        handle.setPointerCapture(e.pointerId);
        pop.classList.add('dragging');
        const move = (ev) => {
          pop.style.left = Math.max(0, Math.min(ev.clientX - dx, innerWidth - pop.offsetWidth)) + 'px';
          pop.style.top = Math.max(0, Math.min(ev.clientY - dy, innerHeight - pop.offsetHeight)) + 'px';
        };
        const up = () => {
          pop.classList.remove('dragging');
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          ta.focus();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });
    }
    root.appendChild(pop);
    popover = pop;
    if (!a) showTargets(targets);
    setTimeout(() => ta.focus(), 0);

    const save = async () => {
      const comment = ta.value.trim();
      if (!comment) { ta.focus(); return; }
      if (a) {
        a.comment = comment;
      } else {
        const described = await Promise.all(targets.map(describe));
        const r = targets[0]?.getBoundingClientRect();
        annotations.push({
          id: Date.now(),
          kind: areaBox ? 'area' : selectedText ? 'text' : 'element',
          area: areaBox ? { x: areaBox.l + scrollX, y: areaBox.t + scrollY, w: dims.w, h: dims.h } : undefined,
          items: described,
          fx: r && r.width ? (x - r.left) / r.width : 0.5,
          fy: r && r.height ? (y - r.top) / r.height : 0.5,
          px: x + scrollX,
          py: y + scrollY,
          selectedText: selectedText || '',
          comment,
        });
      }
      store.save(); closePopover(); renderMarkers();
    };
    pop.querySelector('.save').onclick = save;
    pop.querySelector('.cancel').onclick = closePopover;
    const del = pop.querySelector('.del');
    if (del) del.onclick = () => { annotations = annotations.filter((n) => n !== a); store.save(); closePopover(); renderMarkers(); };
    ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Empty note on a single element: ArrowUp/Down walks to the parent/child instead of moving the caret.
      if (!a && !areaBox && !selectedText && targets.length === 1 && !ta.value && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const next = stepTarget(targets[0], e.key === 'ArrowUp' ? 'up' : 'down');
        if (next) openPopover(null, x, y, [next], '', undefined, { left: pop.style.left, top: pop.style.top }); else toast(e.key === 'ArrowUp' ? 'Already at the top' : 'No child elements');
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
      if (e.key === 'Escape') closePopover();
    });
    ta.addEventListener('keyup', (e) => e.stopPropagation());
  }

  function pathFor(el) {
    const parts = [];
    for (let c = el; c && c !== document.documentElement; c = c.parentElement) parts.unshift(c.tagName.toLowerCase() + (c.id ? '#' + c.id : ''));
    return parts.join(' > ');
  }

  // ---------- output ----------
  function toMarkdown() {
    const lines = [`## Page Feedback: ${document.title || location.hostname}`, `**URL:** ${location.href}`,
      `**Viewport:** ${innerWidth}×${innerHeight}`, ''];
    annotations.forEach((a, i) => {
      const isArea = a.kind === 'area';
      const multi = a.items.length > 1 || isArea;
      const first = a.items[0];
      if (isArea) {
        const r = a.area;
        lines.push(`### ${i + 1}. Area ${Math.round(r.w)}×${Math.round(r.h)} at (${Math.round(r.x)}, ${Math.round(r.y)})`);
        lines.push(`**Region:** page coordinates x=${Math.round(r.x)}, y=${Math.round(r.y)}, ${Math.round(r.w)}×${Math.round(r.h)} (viewport ${innerWidth}×${innerHeight})`);
        lines.push(a.items.length ? `**Elements inside:** ${a.items.length}` : '**Elements inside:** none (empty region)');
      } else {
        lines.push(multi ? `### ${i + 1}. ${a.items.length} elements` : `### ${i + 1}. ${first.tag}${first.name ? ` "${first.name}"` : ''}`);
      }
      a.items.forEach((it, j) => {
        const p = multi ? `${j + 1}. ` : '';
        const ind = multi ? '   ' : '';
        lines.push(`${p}${multi ? `${it.tag}${it.name ? ` "${it.name}"` : ''} — ` : ''}**Selector:** \`${it.selector}\``);
        lines.push(`${ind}**Path:** ${it.path}`);
        if (it.classes && !multi) lines.push(`**Classes:** ${it.classes}`);
        if (it.components.length) lines.push(`${ind}**Components:** ${it.components.join(' > ')}`);
        if (it.source) lines.push(`${ind}**Source:** ${it.source}`);
        lines.push(`${ind}**Styles:** ${it.styles}`);
      });
      if (a.selectedText) lines.push(`**Selected text:** "${a.selectedText}"`);
      lines.push(`**Feedback:** ${a.comment}`, '');
    });
    return lines.join('\n');
  }

  async function copy() {
    if (!annotations.length) return toast('No notes yet');
    const text = toMarkdown();
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
    }
    toast('Copied for your agent');
  }

  // ---------- page event handling ----------
  function targetAt(e) {
    const t = e.target;
    return t && t.nodeType === 1 && !inUI(t) ? t : null;
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'BR', 'HEAD', 'TITLE']);
  const DRAG_THRESHOLD = 6;
  const MODES = { element: { key: 'v', label: 'Element', cursor: 'default' }, text: { key: 't', label: 'Text', cursor: 'text' }, area: { key: 'a', label: 'Area', cursor: 'crosshair' } };

  // Top-most elements fully inside the box (viewport coords), capped to keep output usable.
  function elementsIn(b, fallback) {
    const picked = new Set();
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP_TAGS.has(el.tagName) || inUI(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.left >= b.l - 4 && r.right <= b.r + 4 && r.top >= b.t - 4 && r.bottom <= b.b + 4) picked.add(el);
    }
    const top = [...picked].filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (picked.has(p)) return false;
      return true;
    }).slice(0, 20);
    if (top.length || !fallback) return top;
    const c = document.elementFromPoint((b.l + b.r) / 2, (b.t + b.b) / 2);
    return c && c !== document.body && c !== document.documentElement && !inUI(c) ? [c] : [];
  }

  const boxOf = (a, b) => ({ l: Math.min(a.x, b.x), t: Math.min(a.y, b.y), r: Math.max(a.x, b.x), b: Math.max(a.y, b.y) });

  const isPickable = (el) => {
    if (SKIP_TAGS.has(el.tagName) || inUI(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  };

  // dir 'up' → parent (stopping below <body>); 'down' → previous child we came from, else the child under the mouse, else the first.
  function stepTarget(el, dir) {
    if (dir === 'up') {
      const p = el.parentElement;
      if (!p || p === document.body || p === document.documentElement) return null;
      stepStack.push(el);
      return p;
    }
    const top = stepStack[stepStack.length - 1];
    if (top && top.parentElement === el) { stepStack.pop(); return top; }
    stepStack.length = 0;
    const kids = [...el.children].filter(isPickable);
    if (!kids.length) return null;
    const under = kids.find((k) => {
      const r = k.getBoundingClientRect();
      return lastMouse.x >= r.left && lastMouse.x <= r.right && lastMouse.y >= r.top && lastMouse.y <= r.bottom;
    });
    return under || kids[0];
  }

  // rgb()/rgba() computed value → #rrggbb (or #rrggbbaa); null when fully transparent.
  function toHex(css) {
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return css || null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    const h = (n) => Math.round(n).toString(16).padStart(2, '0');
    return '#' + h(p[0]) + h(p[1]) + h(p[2]) + (a < 1 ? h(a * 255) : '');
  }

  function highlightEl(t) {
    const r = t.getBoundingClientRect();
    Object.assign(hl.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const cs = getComputedStyle(t);
    const fg = toHex(cs.color), bg = toHex(cs.backgroundColor);
    const font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const t1 = document.createElement('div');
    t1.className = 't1';
    t1.textContent = segment(t) + (readableName(t) ? ` — ${readableName(t)}` : '');
    const t2 = document.createElement('div');
    t2.className = 't2';
    const chip = (text, color) => {
      const el = document.createElement('span');
      if (color) { const sw = document.createElement('i'); sw.className = 'sw'; sw.style.background = color; el.appendChild(sw); }
      el.appendChild(document.createTextNode(text));
      t2.appendChild(el);
    };
    chip(`H ${Math.round(r.height)} × W ${Math.round(r.width)}`);
    if (fg) chip(fg, fg);
    if (bg) chip(`bg ${bg}`, bg);
    chip(`${font} ${Math.round(parseFloat(cs.fontSize) * 10) / 10}px`);
    tagEl.replaceChildren(t1, t2);
    tagEl.style.display = 'block';
    const th = tagEl.offsetHeight;
    tagEl.style.left = Math.max(4, Math.min(r.left, innerWidth - tagEl.offsetWidth - 4)) + 'px';
    tagEl.style.top = (r.top - th - 6 >= 4 ? r.top - th - 6 : Math.min(r.bottom + 6, innerHeight - th - 4)) + 'px';
  }

  function updateHint() {
    const on = mode === 'element' && (shiftDown || pending.size > 0);
    hintEl.classList.toggle('on', on);
    hintEl.textContent = pending.size ? `${pending.size} selected · release Shift to add a note` : 'Shift: click elements to multi-select';
  }

  function applyCursor() {
    const m = MODES[mode];
    cursorStyle.textContent = `html,html *{cursor:${m.cursor} !important;${mode === 'text' ? '' : 'user-select:none !important;-webkit-user-select:none !important;'}}`;
  }

  function setMode(m, quiet) {
    mode = m;
    drag = null; endDragVisuals(); closePopover(); pending.clear(); clearTargets(); updateHint(); stepStack.length = 0;
    hl.style.display = tagEl.style.display = 'none';
    root.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    applyCursor();
    getSelection()?.removeAllRanges();
    if (!quiet) toast(`${MODES[m].label} select`);
  }

  function onDown(e) {
    if (inUI(e.target) || e.button !== 0) return;
    e.stopPropagation(); // keep page handlers quiet, but allow native text selection
    drag = mode === 'area' ? { x: e.clientX, y: e.clientY, on: false } : null;
  }

  let dragRaf = 0, lastMove = null;
  function onMove(e) {
    if (drag && e.buttons & 1) {
      if (!drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_THRESHOLD) {
        drag.on = true;
        closePopover();
        hl.style.display = tagEl.style.display = 'none';
      }
      if (drag.on) {
        lastMove = { x: e.clientX, y: e.clientY };
        const b = boxOf(drag, lastMove);
        Object.assign(boxEl.style, { display: 'block', left: b.l + 'px', top: b.t + 'px', width: b.r - b.l + 'px', height: b.b - b.t + 'px' });
        if (!dragRaf) dragRaf = requestAnimationFrame(() => { dragRaf = 0; if (drag?.on) showTargets(elementsIn(boxOf(drag, lastMove), false)); });
        return;
      }
    }
    lastMouse = { x: e.clientX, y: e.clientY };
    if (popover || mode !== 'element') return;
    const t = targetAt(e);
    hovered = t;
    if (!t) { hl.style.display = tagEl.style.display = 'none'; hoverBase = focusEl = null; return; }
    // Moving onto a different element resets any parent/child stepping.
    if (t !== hoverBase) { hoverBase = focusEl = t; stepStack.length = 0; }
    highlightEl(focusEl);
  }

  function endDragVisuals() {
    boxEl.style.display = 'none';
  }

  function swallowNextClick() { skipClick = true; setTimeout(() => { skipClick = false; }, 0); }

  function onMouseUp(e) {
    if (drag?.on) {
      const b = boxOf(drag, { x: e.clientX, y: e.clientY });
      drag = null;
      endDragVisuals();
      swallowNextClick();
      openPopover(null, b.l, b.t, elementsIn(b, false), '', b);
      return;
    }
    drag = null;
    if (mode !== 'text') return;
    const t = targetAt(e);
    if (!t) return;
    const s = getSelection();
    const text = s && s.toString().trim();
    if (text) {
      swallowNextClick();
      const node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
      openPopover(null, e.clientX, e.clientY, [node && !inUI(node) ? node : t], text);
    }
  }

  function onClick(e) {
    if (inUI(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (skipClick) { skipClick = false; return; }
    if (popover) { closePopover(); return; }
    if (mode !== 'element') return;
    const under = targetAt(e);
    if (!under) return;
    const t = focusEl && focusEl.contains(under) ? focusEl : under;
    if (e.shiftKey) {
      pending.has(t) ? pending.delete(t) : pending.add(t);
      lastClick = { x: e.clientX, y: e.clientY };
      showTargets([...pending]);
      updateHint();
      return;
    }
    openPopover(null, e.clientX, e.clientY, [t], '');
  }

  const swallow = (e) => { if (!inUI(e.target)) { e.preventDefault(); e.stopPropagation(); } };
  const stopOnly = (e) => { if (!inUI(e.target)) e.stopPropagation(); };

  function onKey(e) {
    if (e.key === 'Shift') { if (!e.repeat) { shiftDown = true; updateHint(); } return; }
    if (e.key === 'Escape') {
      if (drag?.on) { drag = null; endDragVisuals(); clearTargets(); }
      else if (popover) closePopover();
      else if (pending.size) { pending.clear(); clearTargets(); updateHint(); }
      else deactivate();
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && mode === 'element' && !popover && focusEl && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); e.stopPropagation();
      const next = stepTarget(focusEl, e.key === 'ArrowUp' ? 'up' : 'down');
      if (next) { focusEl = next; highlightEl(next); } else toast(e.key === 'ArrowUp' ? 'Already at the top' : 'No child elements');
      return;
    }
    if (popover || e.metaKey || e.ctrlKey || e.altKey) return; // popover has a textarea: never hijack typing
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const m = Object.keys(MODES).find((k) => MODES[k].key === e.key.toLowerCase());
    if (m) { e.preventDefault(); e.stopPropagation(); setMode(m); }
  }

  function onKeyUp(e) {
    if (e.key !== 'Shift') return;
    shiftDown = false;
    if (mode === 'element' && pending.size && !popover) {
      const els = [...pending];
      pending.clear();
      openPopover(null, lastClick.x, lastClick.y, els, '');
    }
    updateHint();
  }

  function onBlur() { shiftDown = false; pending.clear(); if (!popover) clearTargets(); updateHint(); }

  // ---------- lifecycle ----------
  async function activate() {
    active = true;
    annotations = await store.load();
    document.documentElement.appendChild(host);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);
    addEventListener('blur', onBlur);
    document.head.appendChild(cursorStyle);
    ['dragstart', 'submit'].forEach((n) => document.addEventListener(n, swallow, true));
    document.addEventListener('pointerdown', stopOnly, true);
    addEventListener('scroll', reposition, true);
    addEventListener('resize', reposition);
    setMode(mode, true);
    renderMarkers();
  }

  function deactivate() {
    active = false;
    closePopover();
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mousedown', onDown, true);
    document.removeEventListener('mouseup', onMouseUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    removeEventListener('blur', onBlur);
    cursorStyle.remove();
    shiftDown = false; pending.clear(); updateHint();
    ['dragstart', 'submit'].forEach((n) => document.removeEventListener(n, swallow, true));
    document.removeEventListener('pointerdown', stopOnly, true);
    drag = null; endDragVisuals();
    removeEventListener('scroll', reposition, true);
    removeEventListener('resize', reposition);
    host.remove();
  }

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn?.dataset.m) setMode(btn.dataset.m);
    const a = btn?.dataset.a;
    if (a === 'copy') copy();
    if (a === 'close') deactivate();
    if (a === 'vis') { markersVisible = !markersVisible; renderMarkers(); }
    if (a === 'clear' && annotations.length && confirm(`Delete all ${annotations.length} notes on this page?`)) {
      annotations = []; store.save(); renderMarkers();
    }
  });
  // The bar sits over the crosshair; keep pointer events working inside the shadow UI.
  host.addEventListener('mousemove', () => { if (!drag?.on) hl.style.display = tagEl.style.display = 'none'; });

  window.__pn = { toggle: () => (active ? deactivate() : activate()) };
  activate();
})();
