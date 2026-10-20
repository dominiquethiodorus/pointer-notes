// Runs in the page's MAIN world. Answers probe requests from the content script
// by writing framework info onto the probed element as a data attribute.
(() => {
  if (window.__pnMain) return;
  window.__pnMain = true;

  const nameOf = (type) => type && (type.displayName || type.name || (type.render && (type.render.displayName || type.render.name)) || (type.type && nameOf(type.type)));

  function react(el) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    if (!key) return null;
    const chain = [];
    let source = null;
    for (let f = el[key]; f; f = f.return) {
      if (!source && f._debugSource) source = f._debugSource;
      if (typeof f.type === 'function' || (f.type && typeof f.type === 'object')) {
        const n = nameOf(f.type);
        if (n && !/^(Fragment|Context|Provider|Consumer|Suspense)/.test(n)) chain.push(n);
      }
    }
    return {
      components: chain.slice(0, 6).reverse(),
      source: source ? `${source.fileName}:${source.lineNumber}` : null,
    };
  }

  function vue(el) {
    let inst = el.__vueParentComponent;
    if (!inst) return null;
    const chain = [];
    let file = null;
    for (; inst; inst = inst.parent) {
      const t = inst.type || {};
      if (!file && t.__file) file = t.__file;
      const n = t.name || t.__name;
      if (n) chain.push(n);
    }
    return { components: chain.slice(0, 6).reverse(), source: file };
  }

  document.addEventListener('pn:probe', (e) => {
    const el = document.querySelector('[data-pn-probe="' + e.detail + '"]');
    if (!el) return;
    let info = null;
    try { info = react(el) || vue(el); } catch (_) { /* ignore */ }
    el.setAttribute('data-pn-info', JSON.stringify(info || {}));
  });
})();
