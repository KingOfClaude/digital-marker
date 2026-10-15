const KEY = 'highlights';
const $ = (s) => document.querySelector(s);
let all = {};
const state = { q: '', site: null, sort: 'new' };

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

/* ---------- helpers ---------- */

// Stored text uses \u0001 for block boundaries and keeps source whitespace; tidy it for reading.
function cleanText(raw) {
  return raw
    .split('\u0001')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function displayUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search;
  } catch { return url; }
}
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/* ---------- storage ---------- */

async function load() {
  all = (await chrome.storage.local.get(KEY))[KEY] || {};
  render();
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) {
    all = changes[KEY].newValue || {};
    render();
  }
});

/* ---------- actions ---------- */

let toastTimer;
function toast(msg, actionLabel, onAction) {
  const t = $('#toast');
  t.replaceChildren(el('span', {}, msg));
  if (actionLabel) {
    t.append(el('button', { type: 'button', onclick: () => { t.hidden = true; onAction(); } }, actionLabel));
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

async function removeHighlight(id) {
  const copy = { ...all[id] };
  delete all[id];
  await chrome.storage.local.set({ [KEY]: all });
  toast('Highlight deleted', 'Undo', async () => {
    const data = (await chrome.storage.local.get(KEY))[KEY] || {};
    data[copy.id] = copy;
    await chrome.storage.local.set({ [KEY]: data });
  });
}

function trySend(tabId, id, attempt) {
  chrome.tabs.sendMessage(tabId, { type: 'scrollTo', id }).catch(() => {
    if (attempt < 4) setTimeout(() => trySend(tabId, id, attempt + 1), 600);
  });
}
async function openAt(h) {
  const tab = await chrome.tabs.create({ url: h.url });
  const onUpdated = (tabId, info) => {
    if (tabId === tab.id && info.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      trySend(tab.id, h.id, 0);
    }
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
}

async function copyText(h, btn) {
  await navigator.clipboard.writeText(h.clean);
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
}

/* ---------- view model ---------- */

function visibleItems() {
  const q = state.q.trim().toLowerCase();
  const items = Object.values(all).map((h) => ({ ...h, clean: cleanText(h.text) }));
  const hosts = new Map();
  for (const h of items) hosts.set(hostOf(h.url), (hosts.get(hostOf(h.url)) || 0) + 1);

  let shown = items.filter((h) => {
    if (state.site && hostOf(h.url) !== state.site) return false;
    if (!q) return true;
    return (h.clean + ' ' + h.title + ' ' + hostOf(h.url)).toLowerCase().includes(q);
  });
  shown.sort((a, b) => (state.sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  return { items, hosts, shown };
}

function groupByPage(list) {
  const groups = new Map();
  for (const h of list) {
    if (!groups.has(h.url)) groups.set(h.url, { url: h.url, title: h.title, items: [] });
    groups.get(h.url).items.push(h);
  }
  return [...groups.values()];
}

/* ---------- rendering ---------- */

function renderRail(items, hosts) {
  if (state.site && !hosts.has(state.site)) state.site = null;
  const nPages = new Set(items.map((h) => h.url)).size;
  $('#total').textContent = items.length
    ? `${items.length} highlight${items.length === 1 ? '' : 's'} on ${nPages} page${nPages === 1 ? '' : 's'}`
    : '';

  const btn = (label, count, site) =>
    el('button', { type: 'button', class: 'btn', 'aria-current': String(state.site === site), onclick: () => { state.site = site; render(); } },
      el('span', { class: 'name' }, label), el('span', { class: 'n' }, String(count)));

  const sorted = [...hosts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  $('#sites').replaceChildren(
    ...(items.length ? [btn('All sites', items.length, null), ...sorted.map(([h, n]) => btn(h, n, h))] : [])
  );
}

function renderEntry(h) {
  const copyBtn = el('button', { type: 'button', class: 'btn sm' }, 'Copy');
  copyBtn.addEventListener('click', () => copyText(h, copyBtn));
  return el('article', { class: 'entry' },
    el('p', { class: 'quote' }, el('span', {}, h.clean)),
    el('div', { class: 'meta' },
      el('time', { datetime: new Date(h.createdAt).toISOString() }, fmtDate(h.createdAt)),
      copyBtn,
      el('button', { type: 'button', class: 'btn sm', onclick: () => openAt(h) }, 'Show on page'),
      el('button', { type: 'button', class: 'btn sm danger', onclick: () => removeHighlight(h.id) }, 'Delete')
    )
  );
}

function renderEmpty(hasAny) {
  const box = $('#empty');
  if (hasAny) {
    box.replaceChildren(
      el('h2', {}, 'No highlights match'),
      el('p', {}, 'Try a different search, or choose All sites.')
    );
  } else {
    box.replaceChildren(
      el('h2', {}, 'Nothing remembered yet'),
      el('p', {}, 'Select text on any page, then press ', el('kbd', {}, 'Alt+Shift+H'),
        ' or right-click and choose Highlight selection. Everything you save shows up here.')
    );
  }
}

function render() {
  const { items, hosts, shown } = visibleItems();
  renderRail(items, hosts);
  $('#sites-label').hidden = items.length === 0;
  $('#list').replaceChildren(
    ...groupByPage(shown).map((g) =>
      el('section', { class: 'group' },
        el('div', { class: 'group-title-wrap' },
          el('h2', { class: 'group-title' }, g.title || displayUrl(g.url)),
          el('div', { class: 'group-url' }, displayUrl(g.url))),
        ...g.items.map(renderEntry)))
  );
  const none = shown.length === 0;
  $('#empty').hidden = !none;
  if (none) renderEmpty(items.length > 0);
}

/* ---------- export ---------- */

function exportMarkdown() {
  const { shown } = visibleItems();
  if (!shown.length) { toast('Nothing to export'); return; }
  const lines = ['# Highlights', ''];
  for (const g of groupByPage(shown)) {
    lines.push(`## [${(g.title || displayUrl(g.url)).replace(/[\[\]]/g, '')}](${g.url})`, '');
    for (const h of g.items) {
      lines.push(...h.clean.split('\n').map((l) => `> ${l}`), '>', `> Saved ${fmtDate(h.createdAt)}`, '');
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `highlights-${new Date().toISOString().slice(0, 10)}.md` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- wiring ---------- */

$('#q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('#export').addEventListener('click', exportMarkdown);
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    $('#q').focus();
  }
});

load();
