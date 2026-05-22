// ── THEME ────────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'light' ? 'dark' : 'light';
  html.dataset.theme = next;
  localStorage.setItem('sitesave-theme', next);
}

(function () {
  const saved = localStorage.getItem('sitesave-theme');
  if (saved) document.documentElement.dataset.theme = saved;
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.dataset.theme = 'dark';
})();

// ── STATE ────────────────────────────────────────────────────
const KEY = 'sitesave-v2';
let BM = JSON.parse(localStorage.getItem(KEY) || '[]');
let S  = { filter: 'all', sort: 'newest', editId: null, color: '#111110' };

const COLORS = [
  '#111110','#6b6a67','#a5a39e','#c0392b',
  '#d97706','#16a34a','#2563eb','#7c3aed','#db2777','#0891b2'
];

// ── BOOT ─────────────────────────────────────────────────────
function init() {
  if (!BM.length) seed();
  buildColors();
  render();
}

function seed() {
  const n = Date.now();
  BM = [
    { id: uid(), url: 'https://motherfuckingwebsite.com',   name: 'Mother F***ing Website', tags: ['typography', 'minimal'],       color: '#111110', fav: false, date: n - 864e5 * 1 },
    { id: uid(), url: 'https://en.wikipedia.org/wiki/Design', name: 'Wikipedia — Design',  tags: ['reference'],                   color: '#6b6a67', fav: false, date: n - 864e5 * 2 },
    { id: uid(), url: 'https://tympanus.net/codrops',        name: 'Codrops',               tags: ['interactions', 'inspiration'], color: '#2563eb', fav: true,  date: n - 864e5 * 3 },
    { id: uid(), url: 'https://www.nngroup.com',             name: 'Nielsen Norman Group',  tags: ['ux patterns', 'reference'],   color: '#d97706', fav: true,  date: n - 864e5 * 4 },
    { id: uid(), url: 'https://coolors.co',                  name: 'Coolors',               tags: ['colour', 'tools'],            color: '#c0392b', fav: false, date: n - 864e5 * 5 },
    { id: uid(), url: 'https://gridbyexample.com',           name: 'Grid by Example',       tags: ['reference', 'layouts'],       color: '#16a34a', fav: false, date: n - 864e5 * 6 },
  ];
  persist();
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(BM));
}

// ── FILTER / SORT ─────────────────────────────────────────────
function visible() {
  let list = [...BM];
  const q = document.getElementById('q').value.trim().toLowerCase();

  if      (S.filter === 'fav')    list = list.filter(b => b.fav);
  else if (S.filter === 'recent') list = list.filter(b => Date.now() - b.date < 864e5 * 7);
  else if (S.filter !== 'all')    list = list.filter(b =>
    (b.tags || []).map(t => t.toLowerCase()).includes(S.filter.toLowerCase())
  );

  if (q) list = list.filter(b =>
    b.name.toLowerCase().includes(q) ||
    b.url.toLowerCase().includes(q)  ||
    (b.tags || []).some(t => t.toLowerCase().includes(q))
  );

  if      (S.sort === 'newest') list.sort((a, b) => b.date - a.date);
  else if (S.sort === 'oldest') list.sort((a, b) => a.date - b.date);
  else if (S.sort === 'alpha')  list.sort((a, b) => a.name.localeCompare(b.name));
  else if (S.sort === 'domain') list.sort((a, b) => host(a.url).localeCompare(host(b.url)));

  return list;
}

// ── RENDER ────────────────────────────────────────────────────
function render() {
  renderSidebar();
  renderPills();
  renderCards();
}

function renderCards() {
  const list = visible();
  const g = document.getElementById('grid');
  const TITLES = { all: 'All', fav: 'Favourites', recent: 'Recent' };

  document.getElementById('pg-title').textContent = TITLES[S.filter] || S.filter;
  document.getElementById('pg-count').textContent = `${list.length} site${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    g.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="empty-icon">◫</div>
      <div class="empty-title">Nothing here yet</div>
      <div class="empty-sub">Save your first site to get started.</div>
      <button class="btn-add" style="display:inline-flex;margin:0 auto" onclick="openModal()">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        Save site
      </button>
    </div>`;
    return;
  }

  g.innerHTML = list.map((b, i) => card(b, i)).join('');

  // Load screenshots for all visible cards
  list.forEach(b => loadScreenshot(b.id, b.url));
}

// ── CARD TEMPLATE ─────────────────────────────────────────────
// Cards show screenshot only. Clicking opens the preview modal with iframe.
function card(b, i) {
  const h = host(b.url);
  const tagChips = (b.tags || []).map(t => `<span class="tag-chip">${x(t)}</span>`).join('');

  return `
<div class="card" style="animation-delay:${i * .03}s" onclick="openPreview('${b.id}')">
  <div class="card-thumb" id="thumb-${b.id}">
    <div class="thumb-shimmer" id="shimmer-${b.id}"></div>
    <img id="shot-${b.id}" alt="${x(b.name)} preview">
    <div class="thumb-error" id="err-${b.id}">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.4"/>
        <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
      <span>Preview unavailable</span>
    </div>
    <div class="card-actions">
      <div class="ca ${b.fav ? 'fav-on' : ''}"
           onclick="event.stopPropagation();toggleFav('${b.id}')"
           title="${b.fav ? 'Remove from favourites' : 'Add to favourites'}">${b.fav ? '♥' : '♡'}</div>
      <div class="ca"
           onclick="event.stopPropagation();openModal('${b.id}')"
           title="Edit">✎</div>
      <div class="ca del"
           onclick="event.stopPropagation();delBM('${b.id}')"
           title="Remove">✕</div>
    </div>
  </div>
  <div class="card-foot">
    <div class="foot-favicon">
      <img src="https://www.google.com/s2/favicons?domain=${h}&sz=32"
           onerror="this.style.display='none'" loading="lazy">
    </div>
    <span class="foot-name">${x(b.name)}</span>
    ${(b.tags || []).length ? `<div class="foot-tags">${tagChips}</div>` : ''}
  </div>
</div>`;
}

// ── SCREENSHOT LOADING ────────────────────────────────────────
// Fetches a screenshot from Microlink for each card.
// Shimmer shows while loading; fades in when ready; shows error state if it fails.
function loadScreenshot(id, url) {
  const img     = document.getElementById('shot-' + id);
  const shimmer = document.getElementById('shimmer-' + id);
  const errEl   = document.getElementById('err-' + id);
  if (!img) return;

  const apiUrl = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;

  img.onload = () => {
    if (shimmer) shimmer.style.display = 'none';
    img.classList.add('loaded');
  };

  img.onerror = () => {
    if (shimmer) shimmer.style.display = 'none';
    if (errEl) errEl.style.display = 'flex';
  };

  img.src = apiUrl;
}

// ── PREVIEW MODAL (iframe on demand) ─────────────────────────
function openPreview(id) {
  const b = BM.find(b => b.id === id);
  if (!b) return;

  const h = host(b.url);
  const ov = document.getElementById('preview-ov');

  // Populate bar
  document.getElementById('preview-title').textContent = b.name;
  document.getElementById('preview-url').textContent   = b.url;
  document.getElementById('preview-ext-link').href     = b.url;
  document.getElementById('preview-fav-img').src       = `https://www.google.com/s2/favicons?domain=${h}&sz=32`;

  // Show loading state
  document.getElementById('preview-loading').style.display  = 'flex';
  document.getElementById('preview-iframe').style.display   = 'none';
  document.getElementById('preview-screenshot').style.display = 'none';

  ov.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Load iframe
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '';

  // Set a timeout — if iframe doesn't confirm it loaded within 6 s, show screenshot fallback
  const fallbackTimer = setTimeout(() => showPreviewFallback(b.url), 6000);

  iframe.onload = () => {
    clearTimeout(fallbackTimer);
    try {
      const doc = iframe.contentDocument;
      if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) {
        showPreviewFallback(b.url);
      } else {
        document.getElementById('preview-loading').style.display = 'none';
        iframe.style.display = 'block';
      }
    } catch (e) {
      // Cross-origin: real site loaded fine
      document.getElementById('preview-loading').style.display = 'none';
      iframe.style.display = 'block';
    }
  };

  iframe.onerror = () => {
    clearTimeout(fallbackTimer);
    showPreviewFallback(b.url);
  };

  iframe.src = b.url;
}

function showPreviewFallback(url) {
  document.getElementById('preview-loading').style.display    = 'none';
  document.getElementById('preview-iframe').style.display     = 'none';
  const ss = document.getElementById('preview-screenshot');
  ss.style.display = 'flex';
  const img = ss.querySelector('img');
  if (img && !img.src) {
    img.src = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`;
  }
}

function closePreview() {
  const ov = document.getElementById('preview-ov');
  ov.classList.add('hidden');
  document.body.style.overflow = '';
  // Destroy iframe so the site stops running in the background
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '';
  iframe.style.display = 'none';
}

// ── SIDEBAR ───────────────────────────────────────────────────
function renderSidebar() {
  document.getElementById('cnt-all').textContent = BM.length;
  document.getElementById('cnt-fav').textContent = BM.filter(b => b.fav).length;
  document.getElementById('cnt-rec').textContent = BM.filter(b => Date.now() - b.date < 864e5 * 7).length;

  const allTags = allUniqueTags();

  document.getElementById('sb-tags').innerHTML = allTags.map(tag => {
    const matches  = BM.filter(b => (b.tags || []).map(t => t.toLowerCase()).includes(tag.toLowerCase()));
    const on       = S.filter.toLowerCase() === tag.toLowerCase();
    const dotColor = matches[0]?.color || '#6b6a67';

    return `<div class="sb-item ${on ? 'on' : ''}" onclick="setFilter('${x(tag)}', this)">
      <span class="sb-tag-row">
        <span class="sb-lbl">
          <span class="tag-dot" style="background:${dotColor}"></span>${x(tag)}
        </span>
        <span style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span class="sb-n">${matches.length}</span>
          <button class="sb-del-tag" title="Delete tag"
            onclick="event.stopPropagation();deleteTagCategory('${x(tag)}')"
            aria-label="Delete tag ${x(tag)}">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </span>
      </span>
    </div>`;
  }).join('');

  document.getElementById('tag-dl').innerHTML = allTags.map(t => `<option value="${x(t)}">`).join('');
}

function deleteTagCategory(tag) {
  const lower = tag.toLowerCase();
  BM = BM.map(b => ({ ...b, tags: (b.tags || []).filter(t => t.toLowerCase() !== lower) }));
  if (S.filter.toLowerCase() === lower) S.filter = 'all';
  persist();
  render();
  toast(`Tag "${tag}" deleted`);
}

function allUniqueTags() {
  const seen = new Set();
  BM.forEach(b => (b.tags || []).forEach(t => seen.add(t)));
  return [...seen].sort();
}

// ── PILLS ─────────────────────────────────────────────────────
function renderPills() {
  const tags = allUniqueTags();
  const base = [{ l: 'All', v: 'all' }, { l: '♥ Favourites', v: 'fav' }];
  const all  = [...base, ...tags.map(t => ({ l: t, v: t }))];

  document.getElementById('pills').innerHTML = all.map(p =>
    `<div class="pill ${S.filter === p.v ? 'on' : ''}" onclick="setFilter('${p.v}', null)">${x(p.l)}</div>`
  ).join('');
}

function setFilter(f, el) {
  S.filter = f;
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('on'));
  if (el) el.classList.add('on');
  render();
}

// ── SAVE / EDIT MODAL ─────────────────────────────────────────
let modalTags = [];

function openModal(id = null) {
  S.editId = id;
  modalTags = [];
  document.getElementById('m-title').textContent = id ? 'Edit site' : 'Save a site';

  if (id) {
    const b = BM.find(b => b.id === id);
    document.getElementById('f-url').value  = b.url;
    document.getElementById('f-name').value = b.name;
    modalTags = [...(b.tags || [])];
    S.color = b.color;
  } else {
    document.getElementById('f-url').value  = '';
    document.getElementById('f-name').value = '';
    S.color = COLORS[0];
  }

  renderTagTokens();
  buildColors();
  document.getElementById('m-ov').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-url').focus(), 80);
}

function closeModal() {
  document.getElementById('m-ov').classList.add('hidden');
  S.editId = null;
  modalTags = [];
}

function renderTagTokens() {
  const wrap  = document.getElementById('tag-wrap');
  const input = document.getElementById('tag-bare');
  wrap.querySelectorAll('.tag-token').forEach(el => el.remove());
  modalTags.forEach((t, i) => {
    const el = document.createElement('span');
    el.className = 'tag-token';
    el.innerHTML = `${x(t)}<button onclick="removeTag(${i})" type="button">✕</button>`;
    wrap.insertBefore(el, input);
  });
  input.value = '';
  input.placeholder = modalTags.length ? '' : 'e.g. typography, layouts…';
}

function handleTagKey(e) {
  const val = e.target.value.trim();
  if ((e.key === 'Enter' || e.key === ',') && val) {
    e.preventDefault();
    addTag(val.replace(/,$/, '').trim());
  } else if (e.key === 'Backspace' && !e.target.value && modalTags.length) {
    removeTag(modalTags.length - 1);
  }
}

function addTag(t) {
  t = t.trim().toLowerCase();
  if (!t || modalTags.map(v => v.toLowerCase()).includes(t)) return;
  modalTags.push(t);
  renderTagTokens();
}

function removeTag(i) {
  modalTags.splice(i, 1);
  renderTagTokens();
}

function saveBM() {
  const bare = document.getElementById('tag-bare').value.trim().replace(/,$/, '').trim();
  if (bare) addTag(bare);

  let url = document.getElementById('f-url').value.trim();
  if (!url) { toast('Please enter a URL'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;

  const name = document.getElementById('f-name').value.trim() || host(url);
  const tags = [...modalTags];

  if (S.editId) {
    const idx = BM.findIndex(b => b.id === S.editId);
    BM[idx] = { ...BM[idx], url, name, tags, color: S.color };
    toast('Updated');
  } else {
    BM.unshift({ id: uid(), url, name, tags, color: S.color, fav: false, date: Date.now() });
    toast('Saved');
  }

  persist();
  closeModal();
  render();
}

function hintName() {
  const url = document.getElementById('f-url').value.trim();
  const n   = document.getElementById('f-name');
  if (url && !n.value) n.placeholder = host(url.startsWith('http') ? url : 'https://' + url);
}

// ── ACTIONS ───────────────────────────────────────────────────
function toggleFav(id) {
  const b = BM.find(b => b.id === id);
  if (b) { b.fav = !b.fav; persist(); render(); }
}

function delBM(id) {
  if (!confirm('Remove this site?')) return;
  BM = BM.filter(b => b.id !== id);
  persist();
  render();
  toast('Removed');
}

// ── COLOURS ───────────────────────────────────────────────────
function buildColors() {
  document.getElementById('c-row').innerHTML = COLORS.map(c =>
    `<div class="c-chip" style="background:${c}" onclick="S.color='${c}';updateColors()" title="${c}"></div>`
  ).join('');
  updateColors();
}

function updateColors() {
  document.querySelectorAll('.c-chip').forEach(el => {
    el.classList.toggle('on', toHex(el.style.background) === S.color || el.style.background === S.color);
  });
}

function toHex(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return '#' + m.slice(0, 3).map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
}

// ── UTILS ─────────────────────────────────────────────────────
function uid()   { return Math.random().toString(36).slice(2, 10); }
function host(u) { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } }
function x(s)    { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let _tt;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(_tt);
  _tt = setTimeout(() => el.remove(), 2500);
}

// ── KEYBOARD ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closePreview();
    closeModal();
  }
  if (e.key === 'n' && e.target === document.body) openModal();
  if (e.key === '/' && e.target === document.body) {
    e.preventDefault();
    document.getElementById('q').focus();
  }
});

init();
