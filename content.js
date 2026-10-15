(() => {
  if (window.__hlrLoaded) return;
  window.__hlrLoaded = true;

  const KEY = 'highlights';
  const SEP = '\u0001'; // marks a block boundary between text nodes
  const SKIP_SEL = 'script,style,noscript,textarea,select,option,svg,canvas,iframe,[contenteditable="true"],.hlr-pop,.hlr-toast';
  const NO_WRAP_PARENTS = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COLGROUP', 'UL', 'OL', 'DL', 'SELECT']);

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const pageKey = () => location.origin + location.pathname + location.search;

  /* ---------- text map: all visible-ish text nodes plus their offsets ---------- */

  function blockOf(el, cache) {
    if (cache.has(el)) return cache.get(el);
    let res;
    if (!el || el === document.body || el === document.documentElement) {
      res = document.body;
    } else {
      const d = getComputedStyle(el).display;
      res = d === 'inline' || d === 'contents' ? blockOf(el.parentElement, cache) : el;
    }
    cache.set(el, res);
    return res;
  }

  function textMap() {
    const map = [];
    let full = '';
    let prev = null;
    const cache = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    for (let n; (n = walker.nextNode()); ) {
      const b = blockOf(n.parentElement, cache);
      if (prev && b !== prev) full += SEP;
      prev = b;
      map.push({ node: n, start: full.length });
      full += n.nodeValue;
    }
    return { map, full };
  }

  /* ---------- wrapping and unwrapping ---------- */

  function wrapRange(map, start, end, id) {
    for (const { node, start: s } of map) {
      const e = s + node.nodeValue.length;
      if (e <= start || s >= end) continue;
      if (NO_WRAP_PARENTS.has(node.parentNode.nodeName)) continue;
      const a = Math.max(start, s) - s;
      const b = Math.min(end, e) - s;
      let target = node;
      if (a > 0) target = target.splitText(a);
      if (b - a < target.nodeValue.length) target.splitText(b - a);
      if (!target.nodeValue.trim()) continue;
      const mark = document.createElement('mark');
      mark.className = 'hlr-mark';
      mark.dataset.hlrId = id;
      target.parentNode.insertBefore(mark, target);
      mark.appendChild(target);
    }
  }

  function unwrap(id) {
    document.querySelectorAll(`mark.hlr-mark[data-hlr-id="${CSS.escape(id)}"]`).forEach((m) => {
      const p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
  }

  /* ---------- creating a highlight ---------- */

  function toast(msg) {
    document.querySelectorAll('.hlr-toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'hlr-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  async function save(h) {
    const data = await chrome.storage.local.get(KEY);
    const all = data[KEY] || {};
    all[h.id] = h;
    await chrome.storage.local.set({ [KEY]: all });
  }

  async function doHighlight() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      toast('Select some text first');
      return { ok: false };
    }
    const range = sel.getRangeAt(0);
    const tm = textMap();

    let start = -1, end = -1;
    for (const { node, start: s } of tm.map) {
      if (!range.intersectsNode(node)) continue;
      const from = node === range.startContainer ? range.startOffset : 0;
      const to = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (to <= from) continue;
      if (start < 0) start = s + from;
      end = s + to;
    }
    if (start < 0) {
      toast("Can't highlight that selection");
      return { ok: false };
    }
    const isBlank = (c) => /[\s\u0001]/.test(c);
    while (start < end && isBlank(tm.full[start])) start++;
    while (end > start && isBlank(tm.full[end - 1])) end--;
    if (end <= start) return { ok: false };

    const text = tm.full.slice(start, end);
    const url = pageKey();

    const existing = Object.values((await chrome.storage.local.get(KEY))[KEY] || {});
    if (existing.some((h) => h.url === url && h.text === text)) {
      toast('Already highlighted');
      sel.removeAllRanges();
      return { ok: true };
    }

    const h = {
      id: uid(),
      url,
      title: document.title || location.hostname,
      text,
      prefix: tm.full.slice(Math.max(0, start - 40), start),
      suffix: tm.full.slice(end, end + 40),
      createdAt: Date.now()
    };
    wrapRange(tm.map, start, end, h.id);
    sel.removeAllRanges();
    await save(h);
    toast('Highlight saved');
    return { ok: true };
  }

  /* ---------- re-anchoring saved highlights ---------- */

  function locate(h, full) {
    const pre = h.prefix || '';
    const suf = h.suffix || '';
    let i = full.indexOf(pre + h.text + suf);
    if (i >= 0) return i + pre.length;
    if (pre) {
      i = full.indexOf(pre + h.text);
      if (i >= 0) return i + pre.length;
    }
    if (suf) {
      i = full.indexOf(h.text + suf);
      if (i >= 0) return i;
    }
    return full.indexOf(h.text);
  }

  async function anchorAll() {
    const data = await chrome.storage.local.get(KEY);
    const mine = Object.values(data[KEY] || {}).filter((h) => h.url === pageKey());
    for (const h of mine) {
      if (document.querySelector(`mark.hlr-mark[data-hlr-id="${CSS.escape(h.id)}"]`)) continue;
      const tm = textMap();
      const i = locate(h, tm.full);
      if (i >= 0) wrapRange(tm.map, i, i + h.text.length, h.id);
    }
  }

  /* ---------- remove popover ---------- */

  let pop = null;
  function closePop() {
    if (pop) pop.remove();
    pop = null;
  }

  async function removeHighlight(id) {
    unwrap(id);
    const data = await chrome.storage.local.get(KEY);
    const all = data[KEY] || {};
    delete all[id];
    await chrome.storage.local.set({ [KEY]: all });
  }

  document.addEventListener('click', (e) => {
    const inPop = pop && pop.contains(e.target);
    if (inPop) return;
    closePop();
    const m = e.target.closest && e.target.closest('mark.hlr-mark');
    if (!m || !getSelection().isCollapsed) return;
    const r = m.getBoundingClientRect();
    pop = document.createElement('div');
    pop.className = 'hlr-pop';
    pop.style.top = `${r.bottom + window.scrollY + 6}px`;
    pop.style.left = `${Math.max(8, r.left + window.scrollX)}px`;
    const btn = document.createElement('button');
    btn.textContent = 'Remove highlight';
    btn.addEventListener('click', () => {
      const id = m.dataset.hlrId;
      closePop();
      removeHighlight(id);
    });
    pop.appendChild(btn);
    document.body.appendChild(pop);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  /* ---------- messages and storage changes ---------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'highlight') {
      doHighlight().then(sendResponse).catch((err) => {
        console.error('Digital Highlighter:', err);
        toast("Couldn't save that highlight");
        sendResponse({ ok: false });
      });
      return true;
    }
    if (msg.type === 'scrollTo') {
      anchorAll().then(() => {
        const marks = document.querySelectorAll(`mark.hlr-mark[data-hlr-id="${CSS.escape(msg.id)}"]`);
        if (marks.length) {
          marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
          marks.forEach((m) => {
            m.classList.add('hlr-flash');
            setTimeout(() => m.classList.remove('hlr-flash'), 2000);
          });
        }
        sendResponse({ found: marks.length > 0 });
      });
      return true;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    const now = changes[KEY].newValue || {};
    const ids = new Set([...document.querySelectorAll('mark.hlr-mark')].map((m) => m.dataset.hlrId));
    ids.forEach((id) => { if (!now[id]) unwrap(id); });
    anchorAll(); // picks up highlights restored via Undo in the manager
  });

  // Anchor now, and retry for pages that render their content late.
  anchorAll();
  setTimeout(anchorAll, 1500);
  setTimeout(anchorAll, 5000);
})();
