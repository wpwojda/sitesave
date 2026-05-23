// ── SUPABASE ──────────────────────────────────────────────────
const SUPA_URL = 'https://rrosyexsujynvykdjrlp.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJyb3N5ZXhzdWp5bnZ5a2RqcmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzkwNjAsImV4cCI6MjA5NTA1NTA2MH0.9oo-WeyULtRPCMmrfm0VJrl9e_OQh9cJlIkfA_bSiFI';
const sb = supabase.createClient(SUPA_URL, SUPA_KEY, {
  auth: {
    storage: window.localStorage,
    storageKey: 'sitesave-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
});

// ── PLACEHOLDER SITES (shown to logged-out visitors) ──────────
const PLACEHOLDERS = [
  {
    id: 'placeholder-1',
    url: 'https://www.awwwards.com',
    name: 'Awwwards',
    tags: ['inspiration', 'awards'],
    color: '#111110', fav: false, date: Date.now() - 864e5 * 1
  },
  {
    id: 'placeholder-2',
    url: 'https://tympanus.net/codrops',
    name: 'Codrops',
    tags: ['interactions', 'tutorials'],
    color: '#2563eb', fav: false, date: Date.now() - 864e5 * 2
  },
  {
    id: 'placeholder-3',
    url: 'https://muz.li',
    name: 'Muzli',
    tags: ['inspiration', 'design news'],
    color: '#7c3aed', fav: false, date: Date.now() - 864e5 * 3
  },
];

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
let BM = [];
let CURRENT_USER = null;
let S = { filter: 'all', sort: 'newest', editId: null, color: '#111110' };

const COLORS = [
  '#111110','#6b6a67','#a5a39e','#c0392b',
  '#d97706','#16a34a','#2563eb','#7c3aed','#db2777','#0891b2'
];

// ── BOOT ─────────────────────────────────────────────────────
async function init() {
  // Check for existing session first
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    CURRENT_USER = session.user;
    await enterApp();
  } else {
    enterGuest();
  }

  // Then listen for changes (sign in / sign out)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      CURRENT_USER = session.user;
      if (window.location.hash.includes('access_token')) {
        history.replaceState(null, '', window.location.pathname);
      }
      await enterApp();
    } else if (event === 'SIGNED_OUT') {
      CURRENT_USER = null;
      BM = [];
      enterGuest();
    }
  });
}

// ── GUEST MODE ────────────────────────────────────────────────
function enterGuest() {
  BM = [...PLACEHOLDERS];
  document.getElementById('btn-save-site').classList.add('hidden');
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('btn-sign-in').classList.remove('hidden');
  S.guestMode = true;
  buildColors();
  render();
}

// ── APP MODE ──────────────────────────────────────────────────
async function enterApp() {
  S.guestMode = false;
  document.getElementById('btn-sign-in').classList.add('hidden');
  document.getElementById('btn-save-site').classList.remove('hidden');
  document.getElementById('user-menu').classList.remove('hidden');
  updateUserAvatar();
  await loadBookmarks();
}

// ── AUTH ──────────────────────────────────────────────────────
async function signInWithGoogle() {
  const btn = document.getElementById('btn-sign-in');
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://wpwojda.github.io/sitesave/',
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error) {
    toast('Sign in failed — ' + error.message);
    btn.textContent = 'Sign in';
    btn.disabled = false;
  }
}

async function signOut() {
  document.getElementById('user-dropdown').classList.add('hidden');
  try {
    await Promise.race([
      sb.auth.signOut(),
      new Promise(resolve => setTimeout(resolve, 3000)) // 3s timeout
    ]);
  } catch(e) {
    console.warn('Sign out error:', e);
  }
  // Always enter guest mode regardless of whether signOut succeeded
  CURRENT_USER = null;
  BM = [];
  enterGuest();
}

function updateUserAvatar() {
  const avatar = document.getElementById('user-avatar');
  if (!avatar || !CURRENT_USER) return;
  const name = CURRENT_USER.user_metadata?.full_name || CURRENT_USER.email || '';
  const pic  = CURRENT_USER.user_metadata?.avatar_url;
  if (pic) {
    avatar.innerHTML = `<img src="${pic}" alt="${name}" style="width:32px;height:32px;border-radius:50%;display:block;">`;
  } else {
    avatar.textContent = name.charAt(0).toUpperCase();
  }
}

function toggleUserMenu() {
  const dd = document.getElementById('user-dropdown');
  const emailEl = document.getElementById('user-email');
  if (CURRENT_USER && emailEl) {
    emailEl.textContent = CURRENT_USER.email || CURRENT_USER.user_metadata?.full_name || '';
  }
  dd.classList.toggle('hidden');
}

document.addEventListener('click', e => {
  const menu = document.querySelector('.user-menu');
  if (menu && !menu.contains(e.target)) {
    document.getElementById('user-dropdown')?.classList.add('hidden');
  }
});

// ── DATABASE ──────────────────────────────────────────────────
async function loadBookmarks() {
  const { data, error } = await sb
    .from('bookmarks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showStatus('Unable to load your collection right now — our servers may be temporarily busy. Please refresh to try again.', 'error');
    console.error(error);
    render();
    return;
  }

  BM = (data || []).map(row => {
    let tags = row.tags;
    if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
    return {
      id:    row.id,
      url:   row.url,
      name:  row.name,
      tags:  Array.isArray(tags) ? tags : [],
      color: row.color || '#111110',
      fav:   row.fav   || false,
      date:  new Date(row.created_at).getTime(),
    };
  });

  buildColors();
  render();
}

async function dbInsert(bm, attempt = 1) {
  if (!CURRENT_USER) { toast('Please sign in first'); return null; }

  // Wrap in a timeout so we don't hang forever
  const insertPromise = sb.from('bookmarks').insert({
    url:     bm.url,
    name:    bm.name,
    tags:    JSON.stringify(bm.tags || []),
    color:   bm.color,
    fav:     bm.fav,
    user_id: CURRENT_USER.id,
  }).select().single();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), 8000)
  );

  try {
    const { data, error } = await Promise.race([insertPromise, timeoutPromise]);
    if (error) {
      if (attempt < 3) {
        showStatus(`Saving… (attempt ${attempt + 1} of 3)`);
        await new Promise(r => setTimeout(r, 1500));
        return dbInsert(bm, attempt + 1);
      }
      clearStatus();
      toast('Error: ' + error.message);
      console.error(error);
      return null;
    }
    clearStatus();
    return data;
  } catch(e) {
    if (attempt < 3) {
      showStatus(`Taking longer than usual… retrying (${attempt + 1} of 3)`);
      await new Promise(r => setTimeout(r, 1500));
      return dbInsert(bm, attempt + 1);
    }
    clearStatus();
    showStatus('Could not save right now — our servers may be temporarily busy. Try again in a moment.', 'error');
    return null;
  }
}

async function dbUpdate(id, fields) {
  if (fields.tags) fields.tags = JSON.stringify(fields.tags);
  const { error } = await sb.from('bookmarks').update(fields).eq('id', id);
  if (error) { toast('Error: ' + error.message); console.error(error); }
}

async function dbDelete(id) {
  const { error } = await sb.from('bookmarks').delete().eq('id', id);
  if (error) { toast('Error removing'); console.error(error); }
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

  if (!list.length && !S.guestMode) {
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

  const cards = list.map((b, i) => card(b, i)).join('');
  const prompt = S.guestMode ? signupPromptCard() : '';
  g.innerHTML = cards + prompt;
  list.forEach(b => loadScreenshot(b.id, b.url));
}

// ── SIGNUP PROMPT CARD ────────────────────────────────────────
function signupPromptCard() {
  return `
<div class="card card-signup-prompt" onclick="signInWithGoogle()">
  <div class="card-thumb signup-thumb">
    <div class="signup-prompt-inner">
      <div class="signup-icon">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="1" y="1" width="26" height="26" rx="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
          <path d="M14 8v12M8 14h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="signup-prompt-title">Start your collection</div>
      <div class="signup-prompt-sub">Sign in with Google to save sites and build your own visual library.</div>
      <div class="signup-prompt-cta">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
          <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </svg>
        Sign in with Google
      </div>
    </div>
  </div>
  <div class="card-foot" style="opacity:0;pointer-events:none;">
    <span class="foot-name">&nbsp;</span>
  </div>
</div>`;
}

// ── CARD TEMPLATE ─────────────────────────────────────────────
function card(b, i) {
  const h = host(b.url);
  const isPlaceholder = String(b.id).startsWith('placeholder-');
  const tagChips = (b.tags || []).map(t => `<span class="tag-chip">${x(t)}</span>`).join('');
  const actions = isPlaceholder ? '' : `
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
    </div>`;

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
    ${actions}
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
function loadScreenshot(id, url) {
  const img     = document.getElementById('shot-' + id);
  const shimmer = document.getElementById('shimmer-' + id);
  const errEl   = document.getElementById('err-' + id);
  if (!img) return;
  const apiUrl = `https://image.thum.io/get/width/1440/crop/900/noanimate/${url}`;
  img.onload = () => { if (shimmer) shimmer.style.display = 'none'; img.classList.add('loaded'); };
  img.onerror = () => { if (shimmer) shimmer.style.display = 'none'; if (errEl) errEl.style.display = 'flex'; };
  img.src = apiUrl;
}

// ── PREVIEW MODAL ─────────────────────────────────────────────
function openPreview(id) {
  const b = BM.find(b => b.id == id);
  if (!b) return;
  const h = host(b.url);
  document.getElementById('preview-title').textContent = b.name;
  document.getElementById('preview-url').textContent   = b.url;
  document.getElementById('preview-ext-link').href     = b.url;
  document.getElementById('preview-fav-img').src       = `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  document.getElementById('preview-loading').style.display    = 'flex';
  document.getElementById('preview-iframe').style.display     = 'none';
  document.getElementById('preview-screenshot').style.display = 'none';
  document.getElementById('preview-ov').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '';
  const fallbackTimer = setTimeout(() => showPreviewFallback(b.url), 6000);
  iframe.onload = () => {
    clearTimeout(fallbackTimer);
    try {
      const doc = iframe.contentDocument;
      if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) { showPreviewFallback(b.url); }
      else { document.getElementById('preview-loading').style.display = 'none'; iframe.style.display = 'block'; }
    } catch (e) { document.getElementById('preview-loading').style.display = 'none'; iframe.style.display = 'block'; }
  };
  iframe.onerror = () => { clearTimeout(fallbackTimer); showPreviewFallback(b.url); };
  iframe.src = b.url;
}

function showPreviewFallback(url) {
  document.getElementById('preview-loading').style.display    = 'none';
  document.getElementById('preview-iframe').style.display     = 'none';
  const ss = document.getElementById('preview-screenshot');
  ss.style.display = 'flex';
  const img = ss.querySelector('img');
  if (img && !img.src) img.src = `https://image.thum.io/get/width/1440/crop/900/noanimate/${url}`;
}

function closePreview() {
  document.getElementById('preview-ov').classList.add('hidden');
  document.body.style.overflow = '';
  const iframe = document.getElementById('preview-iframe');
  iframe.src = '';
  iframe.style.display = 'none';
}

// ── SIDEBAR ───────────────────────────────────────────────────
function renderSidebar() {
  const counts = S.guestMode
    ? { all: BM.length, fav: 0, rec: 0 }
    : {
        all: BM.length,
        fav: BM.filter(b => b.fav).length,
        rec: BM.filter(b => Date.now() - b.date < 864e5 * 7).length
      };
  document.getElementById('cnt-all').textContent = counts.all;
  document.getElementById('cnt-fav').textContent = counts.fav;
  document.getElementById('cnt-rec').textContent = counts.rec;

  if (S.guestMode) { document.getElementById('sb-tags').innerHTML = ''; return; }

  const allTags = allUniqueTags();
  document.getElementById('sb-tags').innerHTML = allTags.map(tag => {
    const matches  = BM.filter(b => (b.tags || []).map(t => t.toLowerCase()).includes(tag.toLowerCase()));
    const on       = S.filter.toLowerCase() === tag.toLowerCase();
    const dotColor = matches[0]?.color || '#6b6a67';
    return `<div class="sb-item ${on ? 'on' : ''}" onclick="setFilter('${x(tag)}', this)">
      <span class="sb-tag-row">
        <span class="sb-lbl"><span class="tag-dot" style="background:${dotColor}"></span>${x(tag)}</span>
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
  const affected = BM.filter(b => (b.tags || []).map(t => t.toLowerCase()).includes(lower));
  affected.forEach(b => {
    b.tags = b.tags.filter(t => t.toLowerCase() !== lower);
    dbUpdate(b.id, { tags: b.tags });
  });
  if (S.filter.toLowerCase() === lower) S.filter = 'all';
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
  const tags = S.guestMode ? [] : allUniqueTags();
  const base = [{ l: 'All', v: 'all' }, { l: '♥ Favourites', v: 'fav' }];
  const all  = [...base, ...tags.map(t => ({ l: t, v: t }))];
  document.getElementById('pills').innerHTML = all.map(p =>
    `<div class="pill ${S.filter === p.v ? 'on' : ''}" onclick="setFilter('${p.v}', null)">${x(p.l)}</div>`
  ).join('');
}

function setFilter(f, el) {
  if (S.guestMode) return;
  S.filter = f;
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('on'));
  if (el) el.classList.add('on');
  render();
}

// ── SAVE / EDIT MODAL ─────────────────────────────────────────
let modalTags = [];

function openModal(id = null) {
  if (S.guestMode) { signInWithGoogle(); return; }
  S.editId = id;
  modalTags = [];
  document.getElementById('m-title').textContent = id ? 'Edit site' : 'Save a site';
  if (id) {
    const b = BM.find(b => b.id == id);
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
  S.editId = null; modalTags = [];
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
    e.preventDefault(); addTag(val.replace(/,$/, '').trim());
  } else if (e.key === 'Backspace' && !e.target.value && modalTags.length) {
    removeTag(modalTags.length - 1);
  }
}

function addTag(t) {
  t = t.trim().toLowerCase();
  if (!t || modalTags.map(v => v.toLowerCase()).includes(t)) return;
  modalTags.push(t); renderTagTokens();
}

function removeTag(i) { modalTags.splice(i, 1); renderTagTokens(); }

async function saveBM() {
  const bare = document.getElementById('tag-bare').value.trim().replace(/,$/, '').trim();
  if (bare) addTag(bare);
  let url = document.getElementById('f-url').value.trim();
  if (!url) { toast('Please enter a URL'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;
  const name = document.getElementById('f-name').value.trim() || host(url);
  const tags = [...modalTags];

  // Show loading state on save button immediately
  const saveBtn = document.getElementById('btn-save-modal');
  const origHTML = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span class="save-spinner"></span> Saving…`;

  const resetBtn = () => {
    saveBtn.disabled = false;
    saveBtn.innerHTML = origHTML;
  };

  if (S.editId) {
    const idx = BM.findIndex(b => b.id == S.editId);
    await dbUpdate(S.editId, { url, name, tags, color: S.color });
    BM[idx] = { ...BM[idx], url, name, tags, color: S.color };
    resetBtn();
    toast('Updated');
    closeModal(); render();
  } else {
    const row = await dbInsert({ url, name, tags, color: S.color, fav: false });
    resetBtn();
    if (!row) return;
    BM.unshift({ id: row.id, url, name, tags, color: S.color, fav: false, date: new Date(row.created_at).getTime() });
    toast('Saved');
    closeModal(); render();
  }
}

function hintName() {
  const url = document.getElementById('f-url').value.trim();
  const n   = document.getElementById('f-name');
  if (url && !n.value) n.placeholder = host(url.startsWith('http') ? url : 'https://' + url);
}

// ── ACTIONS ───────────────────────────────────────────────────
async function toggleFav(id) {
  const b = BM.find(b => b.id == id);
  if (!b) return;
  b.fav = !b.fav;
  await dbUpdate(id, { fav: b.fav });
  render();
}

async function delBM(id) {
  if (!confirm('Remove this site?')) return;
  await dbDelete(id);
  BM = BM.filter(b => b.id != id);
  render(); toast('Removed');
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

// ── STATUS BANNER ─────────────────────────────────────────────
let _statusVisible = false;

function showStatus(msg, type = 'warning') {
  let banner = document.getElementById('status-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'status-banner';
    document.body.appendChild(banner);
  }
  banner.className = `status-toast status-${type}`;
  banner.innerHTML = `
    <span class="status-msg">${msg}</span>
    <button class="status-close" onclick="clearStatus()">✕</button>
  `;
  banner.classList.remove('hidden');
  _statusVisible = true;
}

function clearStatus() {
  const banner = document.getElementById('status-banner');
  if (banner) banner.classList.add('hidden');
  _statusVisible = false;
}

function showSuccess(msg) {
  showStatus(msg, 'success');
  setTimeout(clearStatus, 3000);
}
function uid()   { return Math.random().toString(36).slice(2, 10); }
function host(u) { try { return new URL(u).hostname.replace('www.', ''); } catch { return u; } }
function x(s)    { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

let _tt;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(_tt); _tt = setTimeout(() => el.remove(), 2500);
}

// ── KEYBOARD ──────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePreview(); closeModal(); }
  if (e.key === 'n' && e.target === document.body && !S.guestMode) openModal();
  if (e.key === '/' && e.target === document.body) {
    e.preventDefault(); document.getElementById('q').focus();
  }
});

// Wire modal buttons via addEventListener (more reliable than onclick)
document.getElementById('btn-save-modal').addEventListener('click', () => {
  saveBM();
});
document.getElementById('btn-cancel-modal').addEventListener('click', () => {
  closeModal();
});
document.getElementById('m-ov').addEventListener('click', e => {
  if (e.target === document.getElementById('m-ov')) closeModal();
});

init();
