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
    url: 'https://tympanus.net/codrops',
    name: 'Codrops',
    tags: ['inspiration', 'tutorials'],
    color: '#2563eb', fav: false, date: Date.now() - 864e5 * 1
  },
  {
    id: 'placeholder-2',
    url: 'https://muz.li',
    name: 'Muzli',
    tags: ['inspiration', 'design news'],
    color: '#7c3aed', fav: false, date: Date.now() - 864e5 * 2
  },
  {
    id: 'placeholder-3',
    url: 'https://www.awwwards.com',
    name: 'Awwwards',
    tags: ['inspiration', 'awards'],
    color: '#111110', fav: false, date: Date.now() - 864e5 * 3
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
let COLLECTIONS = []; // { id, name, color, created_at }
let CURRENT_USER = null;
let S = { filter: 'all', sort: 'newest', editId: null, color: '#111110' };



// ── BOOT ─────────────────────────────────────────────────────
let _authHandled = false;

async function init() {
  _authHandled = false;

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    _authHandled = true;
    CURRENT_USER = session.user;
    if (window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname);
    }
    await enterApp();
  } else {
    enterGuest();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user && !_authHandled) {
      _authHandled = true;
      CURRENT_USER = session.user;
      if (window.location.hash.includes('access_token')) {
        history.replaceState(null, '', window.location.pathname);
      }
      await enterApp();
    } else if (event === 'SIGNED_OUT') {
      _authHandled = false;
      CURRENT_USER = null;
      BM = [];
      COLLECTIONS = [];
      enterGuest();
    }
  });
}

// ── GUEST MODE ────────────────────────────────────────────────
function enterGuest() {
  BM = [...PLACEHOLDERS];
  document.getElementById('btn-save-site').classList.add('hidden');
  document.getElementById('user-menu').classList.add('hidden');
  const newColBtnG = document.getElementById('btn-new-collection'); if (newColBtnG) newColBtnG.style.display = 'none';
  const signInBtn = document.getElementById('btn-sign-in');
  signInBtn.classList.remove('hidden');
  // Show 'Sign in' for returning users, 'Start saving' for new visitors
  const returning = localStorage.getItem('sitesave-returning');
  signInBtn.textContent = returning ? 'Sign in' : 'Start saving';
  S.guestMode = true;
  showLanding();
}

// ── APP MODE ──────────────────────────────────────────────────
async function enterApp() {
  S.guestMode = false;
  const isFirstSignIn = !localStorage.getItem('sitesave-returning');
  localStorage.setItem('sitesave-returning', 'true');
  document.getElementById('btn-sign-in').classList.add('hidden');
  document.getElementById('btn-save-site').classList.remove('hidden');
  document.getElementById('user-menu').classList.remove('hidden');
  const newColBtn = document.getElementById('btn-new-collection'); if (newColBtn) newColBtn.style.display = '';
  hideLanding();
  updateUserAvatar();
  await loadCollections();
  await loadBookmarks();
  if (isFirstSignIn) setTimeout(startOnboarding, 800);
  else if (window.innerWidth > 640) setTimeout(showKeyboardHint, 1000);
}

// ── AUTH ──────────────────────────────────────────────────────
async function signInWithGoogle() {
  const btn = document.getElementById('btn-sign-in');
  btn.textContent = 'Signing in…';
  btn.disabled = true;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://sitesave.co.uk/',
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
  _authHandled = false;
  document.getElementById('user-dropdown').classList.add('hidden');
  localStorage.removeItem('sitesave-auth');
  try {
    await Promise.race([
      sb.auth.signOut({ scope: 'local' }),
      new Promise(resolve => setTimeout(resolve, 3000))
    ]);
  } catch(e) {
    console.warn('Sign out error:', e);
  }
  CURRENT_USER = null;
  BM = [];
  COLLECTIONS = [];
  enterGuest();
}

async function deleteAccount() {
  document.getElementById('user-dropdown').classList.add('hidden');
  const confirmed = confirm('This will permanently delete your account and all saved sites. This cannot be undone.\n\nAre you sure?');
  if (!confirmed) return;

  try {
    const { error: bmError } = await sb
      .from('bookmarks')
      .delete()
      .eq('user_id', CURRENT_USER.id);
    if (bmError) throw bmError;

    // Delete all screenshots from Storage for this user
    try {
      const { data: files } = await sb.storage.from('screenshots').list(CURRENT_USER.id);
      if (files && files.length > 0) {
        const paths = files.map(f => `${CURRENT_USER.id}/${f.name}`);
        await sb.storage.from('screenshots').remove(paths);
      }
    } catch (e) { console.warn('Storage cleanup failed:', e.message); }

    const { error: authError } = await sb.rpc('delete_user');
    if (authError) throw authError;

    _authHandled = false;
    localStorage.removeItem('sitesave-auth');
    await sb.auth.signOut({ scope: 'local' });
    CURRENT_USER = null;
    BM = [];
    COLLECTIONS = [];
    toast('Account deleted');
    enterGuest();

  } catch(e) {
    console.warn('Delete account error:', e);
    toast('Could not delete account — please contact support');
  }
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
  // Close sidebar collection menu if clicking outside
  if (!e.target.closest('.col-menu-wrap')) {
    document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  }
  // Close modal collection dropdown if clicking outside it
  if (!e.target.closest('.col-dropdown-box')) {
    document.getElementById('col-dropdown-list')?.classList.add('hidden');
  }
});

// ── DATABASE — BOOKMARKS ───────────────────────────────────────
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

  // Load collection memberships for all bookmarks
  const { data: bcData } = await sb
    .from('bookmark_collections')
    .select('bookmark_id, collection_id');

  const bcMap = {}; // bookmark_id -> [collection_id, ...]
  (bcData || []).forEach(row => {
    if (!bcMap[row.bookmark_id]) bcMap[row.bookmark_id] = [];
    bcMap[row.bookmark_id].push(row.collection_id);
  });

  BM = (data || []).map(row => {
    let tags = row.tags;
    if (typeof tags === 'string') { try { tags = JSON.parse(tags); } catch { tags = []; } }
    return {
      id:             row.id,
      url:            row.url,
      name:           row.name,
      tags:           Array.isArray(tags) ? tags : [],
      color:          row.color || '#111110',
      fav:            row.fav   || false,
      date:           new Date(row.created_at).getTime(),
      collections:    bcMap[row.id] || [],
      screenshot_url: row.screenshot_url || null,
    };
  });

  render();
}

async function dbInsert(bm, attempt = 1) {
  if (!CURRENT_USER) { toast('Please sign in first'); return null; }

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

// ── DATABASE — COLLECTIONS ────────────────────────────────────
async function loadCollections() {
  const { data, error } = await sb
    .from('collections')
    .select('id, name, color, created_at, share_token')
    .order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  COLLECTIONS = data || [];
}

async function dbCreateCollection(name) {
  const { data, error } = await sb.from('collections').insert({
    name: name.trim(),
    user_id: CURRENT_USER.id,
  }).select().single();
  if (error) { toast('Error creating collection'); console.error(error); return null; }
  return data;
}

async function dbRenameCollection(id, name) {
  const { error } = await sb.from('collections').update({ name: name.trim() }).eq('id', id);
  if (error) { toast('Error renaming collection'); console.error(error); }
}

async function dbDeleteCollection(id) {
  const { error } = await sb.from('collections').delete().eq('id', id);
  if (error) { toast('Error deleting collection'); console.error(error); }
}

async function dbEnableSharing(id) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map(b => b.toString(36).padStart(2,'0')).join('').slice(0, 24);
  const { error } = await sb.from('collections').update({ share_token: token }).eq('id', id);
  if (error) { toast('Error enabling sharing'); console.error(error); return null; }
  return token;
}

async function dbDisableSharing(id) {
  const { error } = await sb.from('collections').update({ share_token: null }).eq('id', id);
  if (error) { toast('Error revoking link'); console.error(error); }
}

async function dbSetBookmarkCollections(bookmarkId, collectionIds) {
  // Delete all existing memberships for this bookmark
  await sb.from('bookmark_collections').delete().eq('bookmark_id', bookmarkId);
  // Insert new ones
  if (collectionIds.length > 0) {
    const rows = collectionIds.map(cid => ({ bookmark_id: bookmarkId, collection_id: cid }));
    const { error } = await sb.from('bookmark_collections').insert(rows);
    if (error) { toast('Error updating collections'); console.error(error); }
  }
}

// ── FILTER / SORT ─────────────────────────────────────────────
function visible() {
  let list = [...BM];
  const q = document.getElementById('q').value.trim().toLowerCase();

  if      (S.filter === 'fav')    list = list.filter(b => b.fav);
  else if (S.filter === 'recent') list = list.filter(b => Date.now() - b.date < 864e5 * 7);
  else if (S.filter.startsWith('col:')) {
    const colId = S.filter.slice(4);
    list = list.filter(b => (b.collections || []).includes(colId));
  }
  else if (S.filter === 'untagged') list = list.filter(b => !(b.tags || []).length);
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

// ── LANDING SCREEN ───────────────────────────────────────────
function showLanding() {
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
  // Still render cards in the background for the card strip preview
  render();
}

function hideLanding() {
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
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
  const TITLES = { all: 'All', fav: 'Favourites', recent: 'Last 7 days', month: 'This month', untagged: 'Untagged' };

  let title = TITLES[S.filter];
  if (!title && S.filter.startsWith('col:')) {
    const col = COLLECTIONS.find(c => c.id === S.filter.slice(4));
    title = col ? col.name : 'Collection';
  } else if (!title) {
    title = S.filter;
  }

  document.getElementById('pg-title').textContent = title;
  document.getElementById('pg-count').textContent = `${list.length} site${list.length !== 1 ? 's' : ''}`;

  if (!list.length && !S.guestMode) {
    const firstName = CURRENT_USER?.user_metadata?.full_name?.split(' ')[0] || null;
    const greeting  = firstName ? `Welcome, ${firstName}.` : 'Welcome to Sitesave.';
    const isFiltered = S.filter !== 'all' || document.getElementById('q').value.trim();

    if (isFiltered) {
      const q = document.getElementById('q').value.trim();
      let emptyIcon = '◫';
      let emptyTitle = q ? `No results for "${q}"` : 'No sites found';
      let emptySub = q
        ? `<span>We couldn't find anything matching that search. <button class="empty-clear-btn" onclick="document.getElementById('q').value='';renderCards()">Clear search</button></span>`
        : 'Try a different filter.';

      if (S.filter.startsWith('col:') && !document.getElementById('q').value.trim()) {
        const col = COLLECTIONS.find(c => c.id === S.filter.slice(4));
        emptyIcon = '▤';
        emptyTitle = `${col ? col.name : 'This collection'} is empty`;
        emptySub = `<span>Edit any saved site and select <strong>${col ? col.name : 'this collection'}</strong> from the Collections dropdown to add it here.</span>`;
      } else if (S.filter === 'fav' && !document.getElementById('q').value.trim()) {
        emptyIcon = '♡';
        emptyTitle = 'No favourites yet';
        emptySub = 'Click the ♥ on any card to save it here.';
      } else if (S.filter === 'recent' && !document.getElementById('q').value.trim()) {
        emptyIcon = '◷';
        emptyTitle = 'Nothing saved in the last 7 days';
        emptySub = 'Sites you save will appear here for 7 days.';
      } else if (S.filter === 'month' && !document.getElementById('q').value.trim()) {
        emptyIcon = '◈';
        emptyTitle = 'Nothing saved this month';
        emptySub = 'Sites you save this month will appear here.';
      } else if (S.filter === 'untagged' && !document.getElementById('q').value.trim()) {
        emptyIcon = '◫';
        emptyTitle = 'No untagged sites';
        emptySub = 'All your saved sites have at least one tag.';
      }

      g.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">${emptyIcon}</div>
        <div class="empty-title">${emptyTitle}</div>
        <div class="empty-sub empty-sub-html">${emptySub}</div>
      </div>`;
    } else {
      g.innerHTML = `<div class="empty empty-welcome" style="grid-column:1/-1">
        <div class="empty-welcome-inner">
          <div class="empty-greeting">${greeting}</div>
          <div class="empty-title">Your collection is empty.</div>
          <div class="empty-sub">
            Paste any URL to save a site — a screenshot is generated automatically and stored here for you to browse whenever you need inspiration.
          </div>
          <button class="btn-add" style="display:inline-flex;margin:0 auto" id="btn-empty-save">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v8M1 5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            Save your first site
          </button>
          <div class="empty-hint">
            <span>Tip — you can also tag sites to organise them by theme, client, or whatever works for you.</span>
          </div>
        </div>
      </div>`;
      setTimeout(() => {
        document.getElementById('btn-empty-save')?.addEventListener('click', () => openModal());
      }, 0);
    }
    return;
  }

  const cards = list.map((b, i) => card(b, i)).join('');
  g.innerHTML = cards;
  list.forEach(b => loadScreenshot(b.id, b.url));
  // If in guest mode, also populate the landing card strip (fully interactive)
  if (S.guestMode) {
    const strip = document.getElementById('landing-cards');
    if (strip) {
      strip.innerHTML = cards;
      list.forEach(b => loadScreenshot(b.id, b.url));
    }
  }
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
  // Tag chips removed from cards — filtering via pills/sidebar only
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
      <span class="thumb-error-sub">This site blocks screenshot tools.</span>
      ${isPlaceholder ? '' : `<button class="retry-shot-btn" onclick="event.stopPropagation();retryScreenshot('${b.id}','${x(b.url)}')" title="Try capturing the screenshot again">↺ Retry</button>`}
    </div>
    ${actions}
  </div>
  <div class="card-foot">
    <div class="foot-top">
      <div class="foot-favicon">
        <img src="https://www.google.com/s2/favicons?domain=${h}&sz=32"
             onerror="this.style.display='none'" loading="lazy">
      </div>
      <span class="foot-name">${x(b.name)}</span>
    </div>

  </div>
</div>`;
}

// ── SCREENSHOT LOADING ────────────────────────────────────────
// ── SCREENSHOT LAZY LOADING ──────────────────────────────────
const WORKER_URL = 'https://sitesave-screenshots.wpwojda.workers.dev';

let _shotQueue = [];
let _shotActive = 0;
const _shotMax = 3;

function _processQueue() {
  while (_shotActive < _shotMax && _shotQueue.length > 0) {
    const { img, url } = _shotQueue.shift();
    _shotActive++;
    const id = img.id.replace('shot-', '');
    const shimmer = document.getElementById('shimmer-' + id);
    const errEl   = document.getElementById('err-' + id);
    img.onload  = () => { if (shimmer) shimmer.style.display = 'none'; img.classList.add('loaded'); _shotActive--; _processQueue(); };
    img.onerror = () => { if (shimmer) shimmer.style.display = 'none'; if (errEl) errEl.style.display = 'flex'; _shotActive--; _processQueue(); };
    img.src = url;
  }
}

const _shotObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    const url = img.dataset.src;
    if (!url) return;
    _shotObserver.unobserve(img);
    delete img.dataset.src;
    _shotQueue.push({ img, url });
    _processQueue();
  });
}, { rootMargin: '0px' });

function loadScreenshot(id, url) {
  const img = document.getElementById('shot-' + id);
  if (!img) return;
  img.dataset.src = `${WORKER_URL}/?url=${encodeURIComponent(url)}`;
  _shotObserver.observe(img);
}

// Retry a failed screenshot manually from the card
function retryScreenshot(id, url) {
  const errEl   = document.getElementById('err-' + id);
  const shimmer = document.getElementById('shimmer-' + id);
  const img     = document.getElementById('shot-' + id);
  if (!errEl || !img) return;
  errEl.style.display = 'none';
  if (shimmer) shimmer.style.display = '';
  img.onload  = () => { if (shimmer) shimmer.style.display = 'none'; img.classList.add('loaded'); };
  img.onerror = () => { if (shimmer) shimmer.style.display = 'none'; errEl.style.display = 'flex'; toast('Still unavailable — site may block screenshots'); };
  img.src = `${WORKER_URL}/?url=${encodeURIComponent(url)}&bust=${Date.now()}`;
}
function openPreview(id) {
  const b = BM.find(b => b.id == id);
  if (!b) return;
  const h = host(b.url);
  document.getElementById('preview-title').textContent = b.name;
  document.getElementById('preview-url').textContent   = b.url;
  document.getElementById('preview-ext-link').href     = b.url;
  document.getElementById('preview-fav-img').src       = `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  document.getElementById('preview-loading').style.display    = 'none';
  document.getElementById('preview-iframe').style.display     = 'none';
  document.getElementById('preview-ov').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const ss = document.getElementById('preview-screenshot');
  ss.style.display = 'flex';
  const msgEl = document.getElementById('preview-blocked-msg');
  if (msgEl) msgEl.classList.add('hidden');

  const img = ss.querySelector('img');
  if (img) {
    img.removeAttribute('src');
    img.style.display = '';
    const screenshotSrc = b.screenshot_url || `${WORKER_URL}/?url=${encodeURIComponent(b.url)}`;
    img.src = screenshotSrc;
  }

  const tryBtn = document.getElementById('preview-try-live');
  if (tryBtn) {
    tryBtn.style.display = 'inline-flex';
    tryBtn.onclick = () => tryLivePreview(b);
  }
}

function tryLivePreview(b) {
  const tryBtn = document.getElementById('preview-try-live');
  if (tryBtn) { tryBtn.style.display = 'none'; }

  document.getElementById('preview-loading').style.display = 'flex';
  document.getElementById('preview-screenshot').style.display = 'none';

  const iframe = document.getElementById('preview-iframe');
  iframe.onload  = null;
  iframe.onerror = null;
  iframe.removeAttribute('src');

  let resolved = false;

  setTimeout(() => {
    iframe.onload = () => {
      if (resolved) return;
      try {
        const doc = iframe.contentDocument;
        const loc = iframe.contentWindow?.location?.href || '';
        if (loc.startsWith('chrome-error://') || loc.includes('chromewebdata')) {
          resolved = true;
          showPreviewFallback(b.url, true);
          return;
        }
        if (doc && (!doc.body || doc.body.innerHTML.trim() === '')) {
          resolved = true;
          showPreviewFallback(b.url, true);
        } else {
          resolved = true;
          document.getElementById('preview-loading').style.display = 'none';
          document.getElementById('preview-screenshot').style.display = 'none';
          iframe.style.display = 'block';
          iframe.style.height = '100%';
        }
      } catch (e) {
        resolved = true;
        document.getElementById('preview-loading').style.display = 'none';
        document.getElementById('preview-screenshot').style.display = 'none';
        iframe.style.display = 'block';
        iframe.style.height = '100%';
      }
    };

    iframe.onerror = () => {
      if (resolved) return;
      resolved = true;
      showPreviewFallback(b.url, true);
    };

    setTimeout(() => {
      if (!resolved) { resolved = true; showPreviewFallback(b.url, true); }
    }, 12000);

    resolved = false;
    iframe.src = b.url;
  }, 100);
}

function showPreviewFallback(url, showMsg = true) {
  document.getElementById('preview-loading').style.display = 'none';
  const iframe = document.getElementById('preview-iframe');
  iframe.onload  = null;
  iframe.onerror = null;
  iframe.removeAttribute('src');
  iframe.style.display = 'none';
  const ss = document.getElementById('preview-screenshot');
  ss.style.display = 'flex';
  const msgEl = document.getElementById('preview-blocked-msg');
  if (msgEl && showMsg) msgEl.classList.remove('hidden');
  const img = ss.querySelector('img');
  if (img && !img.getAttribute('src')) {
    const bm = BM.find(b => b.url === url);
    img.src = bm?.screenshot_url || `${WORKER_URL}/?url=${encodeURIComponent(url)}`;
  }
}

function closePreview() {
  document.getElementById('preview-ov').classList.add('hidden');
  document.body.style.overflow = '';
  const iframe = document.getElementById('preview-iframe');
  iframe.onload  = null;
  iframe.onerror = null;
  iframe.removeAttribute('src');
  iframe.style.display = 'none';
  iframe.style.height = '';
  const tryBtn = document.getElementById('preview-try-live');
  if (tryBtn) { tryBtn.style.display = 'none'; tryBtn.onclick = null; }
  const msgEl = document.getElementById('preview-blocked-msg');
  if (msgEl) msgEl.classList.add('hidden');
  const ss = document.getElementById('preview-screenshot');
  ss.style.display = 'none';
  const img = ss.querySelector('img');
  if (img) { img.removeAttribute('src'); img.style.display = ''; }
  const errEl = document.getElementById('preview-ss-error');
  if (errEl) errEl.style.display = 'none';
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

  if (S.guestMode) {
    document.getElementById('sb-tags').innerHTML = '';
    document.getElementById('sb-collections').innerHTML = '';
    return;
  }

  // ── Collections section
  const colEl = document.getElementById('sb-collections');
  if (COLLECTIONS.length === 0) {
    colEl.innerHTML = `<div class="sb-empty-hint">
      Group your saved sites into collections and share them with others.
      <button class="sb-empty-create" onclick="createCollection()">Create your first collection</button>
    </div>`;
  } else {
  colEl.innerHTML = COLLECTIONS.map(col => {
    const count = BM.filter(b => (b.collections || []).includes(col.id)).length;
    const on = S.filter === 'col:' + col.id;
    return `
    <div class="sb-item ${on ? 'on' : ''}" onclick="setFilter('col:${col.id}', this)">
      <span class="sb-tag-row">
        <span class="sb-lbl">
          <span class="sb-ico" style="font-size:11px">▤</span>
          ${x(col.name)}${col.share_token ? '<span class="col-shared-dot" title="Shared"></span>' : ''}
        </span>
        <span style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span class="sb-n">${count}</span>
          <div class="col-menu-wrap">
            <button class="sb-del-tag col-menu-btn" title="Options"
              onclick="event.stopPropagation();toggleColMenu('${col.id}')"
              aria-label="Options for ${x(col.name)}">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="2" r="1" fill="currentColor"/>
                <circle cx="5" cy="5" r="1" fill="currentColor"/>
                <circle cx="5" cy="8" r="1" fill="currentColor"/>
              </svg>
            </button>
            <div class="col-dropdown hidden" id="col-dd-${col.id}">
              <button onclick="event.stopPropagation();renameCollection('${col.id}')">Rename</button>
              ${col.share_token
                ? `<button onclick="event.stopPropagation();copyShareLink('${col.share_token}')">Copy link</button>
                   <button class="col-dd-danger" onclick="event.stopPropagation();revokeSharing('${col.id}')">Revoke link</button>`
                : `<button onclick="event.stopPropagation();enableSharing('${col.id}')">Share</button>`
              }
              <button class="col-dd-danger" onclick="event.stopPropagation();deleteCollectionFromSheet('${col.id}')">Delete</button>
            </div>
          </div>
        </span>
      </span>
    </div>`;
  }).join('');
  } // end collections else

  // ── Tags section
  const allTags = allUniqueTags();
  const untaggedCount = BM.filter(b => !(b.tags || []).length).length;
  const untaggedItem = untaggedCount > 0 ? `
    <div class="sb-item ${S.filter === 'untagged' ? 'on' : ''}" onclick="setFilter('untagged', this)">
      <span class="sb-tag-row">
        <span class="sb-lbl"><span class="tag-dot" style="background:var(--text3)"></span>Untagged</span>
        <span class="sb-n">${untaggedCount}</span>
      </span>
    </div>` : '';
  document.getElementById('sb-tags').innerHTML = untaggedItem + allTags.map(tag => {
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

// ── COLLECTION MENU ───────────────────────────────────────────
function toggleColMenu(id) {
  const dd = document.getElementById('col-dd-' + id);
  if (!dd) return;
  const wasHidden = dd.classList.contains('hidden');
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  if (wasHidden) dd.classList.remove('hidden');
}

async function renameCollection(id) {
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  const col = COLLECTIONS.find(c => c.id === id);
  if (!col) return;

  // On mobile (sheet open), use inline rename input
  const sheetOpen = !document.getElementById('sheet-ov').classList.contains('hidden');
  if (sheetOpen) {
    document.getElementById('sheet-confirm')?.remove();
    const el = document.createElement('div');
    el.id = 'sheet-confirm';
    el.className = 'sheet-confirm';
    el.innerHTML = `
      <div class="sheet-confirm-title">Rename collection</div>
      <input class="sheet-rename-input finput" value="${x(col.name)}" maxlength="60">
      <div class="sheet-confirm-btns" style="margin-top:10px">
        <button class="sheet-confirm-cancel" onclick="document.getElementById('sheet-confirm').remove()">Cancel</button>
        <button class="sheet-confirm-ok" style="background:var(--accent)">Save</button>
      </div>`;
    // Stop clicks bubbling to the overlay
    el.addEventListener('click', e => e.stopPropagation());

    el.querySelector('.sheet-confirm-cancel').addEventListener('click', () => el.remove());
    el.querySelector('.sheet-confirm-ok').addEventListener('click', async () => {
      const val = el.querySelector('input').value.trim();
      if (!val || val === col.name) { el.remove(); return; }
      await dbRenameCollection(id, val);
      col.name = val;
      el.remove();
      render();
      renderFilterSheet();
      toast('Collection renamed');
    });
    el.querySelector('input').addEventListener('keydown', e => {
      if (e.key === 'Enter') el.querySelector('.sheet-confirm-ok').click();
      if (e.key === 'Escape') el.remove();
    });
    const sheet = document.getElementById('filter-sheet');
    sheet.prepend(el);
    sheet.scrollTop = 0;
    setTimeout(() => el.querySelector('input').focus(), 50);
    return;
  }

  // Desktop — native prompt is fine
  const newName = prompt('Rename collection:', col.name);
  if (!newName || !newName.trim() || newName.trim() === col.name) return;
  await dbRenameCollection(id, newName.trim());
  col.name = newName.trim();
  render();
  toast('Collection renamed');
}

function openDelColModal(id) {
  const col = COLLECTIONS.find(c => c.id === id);
  if (!col) return;
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  const bmIds = BM.filter(b => (b.collections || []).includes(id)).map(b => b.id);

  document.getElementById('del-col-title').textContent = `Delete "${col.name}"?`;
  const onlyBtn = document.getElementById('del-col-only-btn');
  const allBtn  = document.getElementById('del-col-all-btn');

  onlyBtn.textContent = 'Delete collection only';
  onlyBtn.onclick = () => { closeDelColModal(); deleteCollection(id, false); };

  if (bmIds.length > 0) {
    allBtn.textContent = `Delete collection and ${bmIds.length} bookmark${bmIds.length !== 1 ? 's' : ''}`;
    allBtn.onclick = () => { closeDelColModal(); deleteCollection(id, true); };
    allBtn.classList.remove('hidden');
  } else {
    allBtn.classList.add('hidden');
  }

  document.getElementById('del-col-ov').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeDelColModal() {
  document.getElementById('del-col-ov').classList.add('hidden');
  document.body.style.overflow = '';
}

async function deleteCollectionFromSheet(id) {
  openDelColModal(id);
}

async function deleteCollection(id, withBookmarks = false) {
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  const col = COLLECTIONS.find(c => c.id === id);
  if (!col) return;
  const bmIds = BM.filter(b => (b.collections || []).includes(id)).map(b => b.id);

  if (withBookmarks && bmIds.length > 0) {
    // Delete all bookmarks in this collection first
    await sb.from('bookmarks').delete().in('id', bmIds).eq('user_id', CURRENT_USER.id);
    BM = BM.filter(b => !bmIds.includes(b.id));
  }

  await dbDeleteCollection(id);
  COLLECTIONS = COLLECTIONS.filter(c => c.id !== id);
  BM.forEach(b => { b.collections = (b.collections || []).filter(cid => cid !== id); });
  if (S.filter === 'col:' + id) S.filter = 'all';
  render();
  if (!document.getElementById('sheet-ov').classList.contains('hidden')) {
    renderFilterSheet();
  }
  toast(withBookmarks ? `"${col.name}" and its bookmarks deleted` : `"${col.name}" deleted`);
}

async function enableSharing(id) {
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  const col = COLLECTIONS.find(c => c.id === id);
  if (!col) return;
  const token = await dbEnableSharing(id);
  if (!token) return;
  col.share_token = token;
  render();
  copyShareLink(token);
  toast('Sharing enabled — link copied');
}

async function revokeSharing(id) {
  document.querySelectorAll('.col-dropdown').forEach(d => d.classList.add('hidden'));
  const col = COLLECTIONS.find(c => c.id === id);
  if (!col) return;
  if (!confirm('Revoke the share link? Anyone with the current link will no longer be able to view this collection.')) return;
  await dbDisableSharing(id);
  col.share_token = null;
  render();
  toast('Share link revoked');
}

function copyShareLink(token) {
  const url = `${location.origin}/share.html?c=${token}`;
  navigator.clipboard.writeText(url).then(() => toast('Link copied — anyone can view this collection without an account'));
}

async function createCollection() {
  const name = prompt('Collection name:');
  if (!name || !name.trim()) return;
  const col = await dbCreateCollection(name.trim());
  if (!col) return;
  COLLECTIONS.push(col);
  render();
  // If the filter sheet is open, re-render it so the new collection appears immediately
  if (!document.getElementById('sheet-ov').classList.contains('hidden')) {
    renderFilterSheet();
  }
  toast(`"${col.name}" created`);
}

function deleteTagCategory(tag, skipConfirm = false) {
  const affected = BM.filter(b => (b.tags || []).map(t => t.toLowerCase()).includes(tag.toLowerCase()));
  // On mobile (sheet open), use inline confirm; on desktop use native confirm
  const sheetOpen = !document.getElementById('sheet-ov').classList.contains('hidden');
  if (sheetOpen && !skipConfirm) {
    showSheetConfirm(
      `Delete tag "${tag}"?`,
      `This will remove it from ${affected.length} site${affected.length !== 1 ? 's' : ''}. The sites themselves will not be deleted.`,
      () => deleteTagCategory(tag, true)
    );
    return;
  }
  if (!sheetOpen && !skipConfirm) {
    if (!confirm(`Delete tag "${tag}"?\n\nThis will remove it from ${affected.length} site${affected.length !== 1 ? 's' : ''}. The sites themselves will not be deleted.`)) return;
  }
  const lower = tag.toLowerCase();
  affected.forEach(b => {
    b.tags = b.tags.filter(t => t.toLowerCase() !== lower);
    dbUpdate(b.id, { tags: b.tags });
  });
  if (S.filter.toLowerCase() === lower) S.filter = 'all';
  render();
  closeFilterSheet();
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
  const base = [{ l: 'All', v: 'all' }, { l: '♥ Favourites', v: 'fav' }, { l: '◷ Last 7 days', v: 'recent' }, { l: '◈ This month', v: 'month' }, { l: 'Untagged', v: 'untagged' }];
  const all  = [...base, ...tags.map(t => ({ l: t, v: t }))];
  document.getElementById('pills').innerHTML = all.map(p =>
    `<div class="pill ${S.filter === p.v ? 'on' : ''}" onclick="setFilter('${p.v}', null)">${x(p.l)}</div>`
  ).join('');
}

function setFilter(f, el) {
  updateFilterBtn();
  if (S.guestMode) return;
  S.filter = f;
  document.querySelectorAll('.sb-item').forEach(e => e.classList.remove('on'));
  if (el) el.classList.add('on');
  render();
}

// ── SAVE / EDIT MODAL ─────────────────────────────────────────
let modalTags = [];
let modalCollections = []; // collection ids selected in modal

function openModal(id = null) {
  if (S.guestMode) { signInWithGoogle(); return; }
  S.editId = id;
  modalTags = [];
  modalCollections = [];
  document.body.style.overflow = 'hidden';
  document.getElementById('m-title').textContent = id ? 'Edit site' : 'Save a site';
  // Show URL hint for new users on first save
  const urlHint = document.getElementById('url-hint');
  if (urlHint) {
    urlHint.style.display = (!id && !localStorage.getItem('sitesave-saved')) ? '' : 'none';
  }
  // Show modal field tooltips on first open
  if (!id && !localStorage.getItem('sitesave-modal-tip')) {
    setTimeout(startModalTips, 400);
  }
  // Show first-time collections tooltip if user has collections and hasn't seen it yet
  const hasSeenTip = localStorage.getItem('sitesave-col-tip');
  if (!hasSeenTip && COLLECTIONS.length > 0 && !id) {
    setTimeout(() => showCollectionTip(), 400);
  }
  if (id) {
    const b = BM.find(b => b.id == id);
    document.getElementById('f-url').value  = b.url;
    document.getElementById('f-name').value = b.name;
    modalTags = [...(b.tags || [])];
    modalCollections = [...(b.collections || [])];
  } else {
    document.getElementById('f-url').value  = '';
    document.getElementById('f-name').value = '';
    // Clear any leftover duplicate warning
    const dupWarn = document.getElementById('url-dup-warn');
    if (dupWarn) { dupWarn.style.display = 'none'; dupWarn.textContent = ''; }
  }
  renderTagTokens();
  renderCollectionDropdown();
  document.getElementById('m-ov').classList.remove('hidden');
  setTimeout(async () => {
    const urlField = document.getElementById('f-url');
    urlField.focus();
    // Auto-fill URL from clipboard if it looks like a URL and field is empty
    if (!id && !urlField.value) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && /^https?:\/\/.+/.test(text.trim())) {
          urlField.value = text.trim();
          urlField.dispatchEvent(new Event('input'));
        }
      } catch (e) {
        // Clipboard access denied — fail silently
      }
    }
  }, 80);

  // Wire up duplicate URL detection on the URL field (new saves only)
  const fUrl = document.getElementById('f-url');
  const dupWarn = document.getElementById('url-dup-warn');
  if (!id && dupWarn) {
    fUrl.oninput = () => {
      const val = fUrl.value.trim();
      const exists = val && BM.some(b => b.url === val || b.url === val.replace(/\/$/, '') || b.url.replace(/\/$/, '') === val);
      dupWarn.style.display = exists ? '' : 'none';
      if (exists) {
        const match = BM.find(b => b.url === val || b.url === val.replace(/\/$/, '') || b.url.replace(/\/$/, '') === val);
        dupWarn.textContent = `Already saved as "${match.name || host(match.url)}"`;
      }
    };
  } else if (dupWarn) {
    dupWarn.style.display = 'none';
    fUrl.oninput = null;
  }
}

function showCollectionTip() {
  const wrap = document.getElementById('col-select-wrap');
  if (!wrap || document.getElementById('col-tip')) return;
  localStorage.setItem('sitesave-col-tip', 'true');
  const tip = document.createElement('div');
  tip.id = 'col-tip';
  tip.className = 'col-tip';
  tip.textContent = 'New — add this site to a collection';
  wrap.appendChild(tip);
  setTimeout(() => tip?.remove(), 3500);
}

function closeModal() {
  document.getElementById('m-ov').classList.add('hidden');
  document.body.style.overflow = '';
  S.editId = null; modalTags = []; modalCollections = [];
  const dupWarn = document.getElementById('url-dup-warn');
  if (dupWarn) { dupWarn.style.display = 'none'; dupWarn.textContent = ''; }
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

function renderCollectionDropdown() {
  const wrap = document.getElementById('col-select-wrap');
  if (!wrap) return;
  if (COLLECTIONS.length === 0) {
    wrap.innerHTML = `<div class="col-empty-hint">No collections yet — <button class="col-inline-create" onclick="createCollectionFromModal()">create one</button></div>`;
    return;
  }
  wrap.innerHTML = `
    <div class="col-dropdown-box" id="col-dropdown-box">
      <button class="col-dropdown-trigger" onclick="toggleModalColDropdown()" type="button">
        <span id="col-dropdown-label">${collectionDropdownLabel()}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="col-dropdown-list hidden" id="col-dropdown-list">
        ${COLLECTIONS.map(col => `
          <label class="col-dropdown-item">
            <input type="checkbox" value="${col.id}" ${modalCollections.includes(col.id) ? 'checked' : ''}
              onchange="toggleModalCollection('${col.id}')">
            <span>${x(col.name)}</span>
          </label>
        `).join('')}
      </div>
    </div>`;
}

function collectionDropdownLabel() {
  if (modalCollections.length === 0) return 'None';
  if (modalCollections.length === 1) {
    const col = COLLECTIONS.find(c => c.id === modalCollections[0]);
    return col ? col.name : 'None';
  }
  return `${modalCollections.length} collections`;
}

function toggleModalColDropdown() {
  const list = document.getElementById('col-dropdown-list');
  if (!list) return;
  list.classList.toggle('hidden');
}

function toggleModalCollection(colId) {
  if (modalCollections.includes(colId)) {
    modalCollections = modalCollections.filter(id => id !== colId);
  } else {
    modalCollections.push(colId);
  }
  const label = document.getElementById('col-dropdown-label');
  if (label) label.textContent = collectionDropdownLabel();
}

async function createCollectionFromModal() {
  const name = prompt('Collection name:');
  if (!name || !name.trim()) return;
  const col = await dbCreateCollection(name.trim());
  if (!col) return;
  COLLECTIONS.push(col);
  modalCollections.push(col.id);
  renderCollectionDropdown();
  toast(`"${col.name}" created`);
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
  // Close collection dropdown if open
  document.getElementById('col-dropdown-list')?.classList.add('hidden');

  const bare = document.getElementById('tag-bare').value.trim().replace(/,$/, '').trim();
  if (bare) addTag(bare);
  let url = document.getElementById('f-url').value.trim();
  if (!url) { toast('Please enter a URL'); return; }
  if (!url.startsWith('http')) url = 'https://' + url;
  const name = document.getElementById('f-name').value.trim() || host(url);
  const tags = [...modalTags];
  const collections = [...modalCollections];

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
    await dbUpdate(S.editId, { url, name, tags });
    await dbSetBookmarkCollections(S.editId, collections);
    BM[idx] = { ...BM[idx], url, name, tags, collections };
    resetBtn();
    toast('Updated');
    closeModal(); render();
  } else {
    localStorage.setItem('sitesave-saved', 'true');
    const row = await dbInsert({ url, name, tags, color: '#111110', fav: false });
    resetBtn();
    if (!row) return;
    await dbSetBookmarkCollections(row.id, collections);
    BM.unshift({ id: row.id, url, name, tags, color: S.color, fav: false, date: new Date(row.created_at).getTime(), collections });
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
  if (e.key === 'Escape') { closeFilterSheet();
    document.getElementById('col-dropdown-list')?.classList.add('hidden');
    closePreview(); closeModal();
  }
  if (e.key === 'n' && e.target === document.body && !S.guestMode) openModal();
  if (e.key === '/' && e.target === document.body) {
    e.preventDefault(); document.getElementById('q').focus();
  }
});

document.getElementById('btn-save-modal').addEventListener('click', () => { saveBM(); });
document.getElementById('btn-cancel-modal').addEventListener('click', () => { closeModal(); });

let _modalMousedownOnOverlay = false;
const mOv = document.getElementById('m-ov');
mOv.addEventListener('mousedown', e => { _modalMousedownOnOverlay = e.target === mOv; });
mOv.addEventListener('mouseup', e => {
  if (_modalMousedownOnOverlay && e.target === mOv) closeModal();
  _modalMousedownOnOverlay = false;
});
// Prevent background scroll when touching the overlay backdrop
mOv.addEventListener('touchmove', e => {
  if (!e.target.closest('.modal')) e.preventDefault();
}, { passive: false });

const pOv = document.getElementById('preview-ov');
let _previewMousedownOnOverlay = false;
pOv.addEventListener('mousedown', e => { _previewMousedownOnOverlay = e.target === pOv; });
pOv.addEventListener('mouseup', e => {
  if (_previewMousedownOnOverlay && e.target === pOv) closePreview();
  _previewMousedownOnOverlay = false;
});

// ── GRID DENSITY ──────────────────────────────────────────────
S.cols = parseInt(localStorage.getItem('sitesave-cols') || '2');

function setGridCols(n) {
  S.cols = n;
  localStorage.setItem('sitesave-cols', n);
  if (window.innerWidth > 640) {
    document.getElementById('grid').style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  } else {
    document.getElementById('grid').style.gridTemplateColumns = '';
  }
  document.querySelectorAll('.grid-btn').forEach(b => {
    b.classList.toggle('on', parseInt(b.dataset.cols) === n);
  });
}

document.addEventListener('DOMContentLoaded', () => { setGridCols(S.cols); });

window.addEventListener('resize', () => {
  const grid = document.getElementById('grid');
  if (!grid) return;
  if (window.innerWidth <= 640) {
    grid.style.gridTemplateColumns = '';
  } else {
    grid.style.gridTemplateColumns = `repeat(${S.cols}, 1fr)`;
  }
});

// Sheet overlay — close when tapping the dark backdrop (not the sheet panel itself)
document.getElementById('sheet-ov').addEventListener('click', e => {
  if (!e.target.closest('#filter-sheet')) closeFilterSheet();
});

// ── SHEET DRAG TO CLOSE ───────────────────────────────────────
(function() {
  const sheet = document.getElementById('filter-sheet');
  let startY = 0, dragY = 0, dragging = false;
  const THRESHOLD = 100;

  sheet.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    dragY = 0;
    dragging = false;
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    // Start dragging only if swiping down and sheet is scrolled to top
    if (!dragging) {
      if (dy > 8 && sheet.scrollTop <= 0) {
        dragging = true;
        sheet.style.transition = 'none';
      } else {
        return;
      }
    }
    dragY = Math.max(0, dy);
    sheet.style.transform = `translateY(${dragY}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = 'transform .25s ease';
    if (dragY > THRESHOLD) {
      sheet.style.transform = `translateY(100%)`;
      setTimeout(() => {
        sheet.style.transform = '';
        sheet.style.transition = '';
        closeFilterSheet();
      }, 250);
    } else {
      sheet.style.transform = '';
      setTimeout(() => { sheet.style.transition = ''; }, 250);
    }
    dragY = 0;
  });
})();

init();

// ── SHEET INLINE CONFIRM ─────────────────────────────────────
function showSheetConfirm(title, message, onConfirm, confirmLabel = 'Delete', onConfirm2 = null, confirm2Label = null) {
  document.getElementById('sheet-confirm')?.remove();

  const el = document.createElement('div');
  el.id = 'sheet-confirm';
  el.className = 'sheet-confirm';
  el.innerHTML = `
    <div class="sheet-confirm-title">${x(title)}</div>
    <div class="sheet-confirm-msg">${x(message)}</div>
    <div class="sheet-confirm-btns">
      <button class="sheet-confirm-cancel">Cancel</button>
      <button class="sheet-confirm-ok">${x(confirmLabel)}</button>
      ${onConfirm2 ? `<button class="sheet-confirm-ok2">${x(confirm2Label)}</button>` : ''}
    </div>`;

  // Stop ALL clicks inside the confirm panel bubbling to the overlay
  el.addEventListener('click', e => e.stopPropagation());

  el.querySelector('.sheet-confirm-cancel').addEventListener('click', () => el.remove());
  el.querySelector('.sheet-confirm-ok').addEventListener('click', () => {
    el.remove();
    onConfirm();
  });

  if (onConfirm2) {
    el.querySelector('.sheet-confirm-ok2').addEventListener('click', () => {
      el.remove();
      onConfirm2();
    });
  }

  // Prepend so it appears at the top of the sheet, not the bottom
  const sheet = document.getElementById('filter-sheet');
  sheet.prepend(el);
  sheet.scrollTop = 0;
}

// ── FILTER BOTTOM SHEET ───────────────────────────────────────
function openFilterSheet() {
  if (S.guestMode) return;
  renderFilterSheet();
  document.getElementById('sheet-ov').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeFilterSheet() {
  document.getElementById('sheet-ov').classList.add('hidden');
  document.body.style.overflow = '';
  document.getElementById('sheet-confirm')?.remove();
}

function applySheetFilter(f) {
  S.filter = f;
  render();
  updateFilterBtn();
  closeFilterSheet();
}

function updateFilterBtn() {
  const btn = document.getElementById('filter-btn');
  if (!btn) return;
  const isFiltered = S.filter !== 'all';
  btn.classList.toggle('active', isFiltered);
}

function renderFilterSheet() {
  // Update counts
  document.getElementById('sheet-cnt-all').textContent = BM.length;
  document.getElementById('sheet-cnt-fav').textContent = BM.filter(b => b.fav).length;
  document.getElementById('sheet-cnt-rec').textContent = BM.filter(b => Date.now() - b.date < 864e5 * 7).length;

  // Highlight active item in Library
  document.querySelectorAll('#filter-sheet .sheet-item[data-filter]').forEach(el => {
    el.classList.toggle('on', el.dataset.filter === S.filter);
  });

  // Collections
  const colEl = document.getElementById('sheet-collections');
  const colSec = document.getElementById('sheet-collections-sec');
  if (COLLECTIONS.length === 0) {
    colEl.innerHTML = `<div class="sheet-empty">
      Group your saved sites into collections and share them with others.
      <button class="col-inline-create" style="display:block;margin-top:8px" onclick="createCollection()">Create your first collection</button>
    </div>`;
  } else {
    colEl.innerHTML = COLLECTIONS.map(col => {
      const count = BM.filter(b => (b.collections || []).includes(col.id)).length;
      const on = S.filter === 'col:' + col.id;
      return `<div class="sheet-item ${on ? 'on' : ''}" onclick="applySheetFilter('col:${col.id}')">
        <span class="sheet-ico" style="font-size:11px">▤</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(col.name)}</span>
        <span class="sheet-n">${count}</span>
        <button class="sheet-action-btn" title="Rename" onclick="event.stopPropagation();renameCollection('${col.id}')">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.5 1.5l3 3-9 9H1.5v-3l9-9z"/>
          </svg>
        </button>
        ${col.share_token
          ? `<button class="sheet-action-btn" title="Copy link" onclick="event.stopPropagation();copyShareLink('${col.share_token}')">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 2h4v4M8.5 6.5l4.5-4.5M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"/>
              </svg>
             </button>`
          : `<button class="sheet-action-btn" title="Share" onclick="event.stopPropagation();enableSharing('${col.id}')">
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 2h4v4M8.5 6.5l4.5-4.5M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9"/>
              </svg>
             </button>`
        }
        <button class="sheet-action-btn sheet-action-del" title="Delete" onclick="event.stopPropagation();deleteCollectionFromSheet('${col.id}')">✕</button>
      </div>`;
    }).join('');
  }

  // Tags
  const tagsEl = document.getElementById('sheet-tags');
  const tags = allUniqueTags();
  const untagged = BM.filter(b => !(b.tags || []).length).length;
  const untaggedHtml = untagged > 0 ? `
    <div class="sheet-item ${S.filter === 'untagged' ? 'on' : ''}" onclick="applySheetFilter('untagged')">
      <span class="sheet-tag-dot" style="background:var(--text3)"></span>
      Untagged
      <span class="sheet-n">${untagged}</span>
    </div>` : '';

  if (tags.length === 0 && !untagged) {
    tagsEl.innerHTML = `<div class="sheet-empty">No tags yet.</div>`;
  } else {
    tagsEl.innerHTML = untaggedHtml + tags.map(tag => {
      const matches = BM.filter(b => (b.tags || []).map(t => t.toLowerCase()).includes(tag.toLowerCase()));
      const on = S.filter.toLowerCase() === tag.toLowerCase();
      const dotColor = matches[0]?.color || '#6b6a67';
      return `<div class="sheet-item ${on ? 'on' : ''}" onclick="applySheetFilter('${x(tag)}')">
        <span class="sheet-tag-dot" style="background:${dotColor}"></span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x(tag)}</span>
        <span class="sheet-n">${matches.length}</span>
        <button class="sheet-action-btn sheet-action-del" title="Delete tag" onclick="event.stopPropagation();deleteTagCategory('${x(tag)}')">✕</button>
      </div>`;
    }).join('');
  }
}

// ── MODAL FIELD TIPS ─────────────────────────────────────────
const MODAL_TIPS = [
  { target: 'f-url',         title: 'Paste a URL', text: 'Any website URL — Sitesave captures a screenshot automatically.', position: 'below' },
  { target: 'f-name',        title: 'Name', text: 'Auto-filled from the domain. Edit it to something more descriptive if you like.', position: 'below' },
  { target: 'tag-wrap',      title: 'Tags', text: 'Add keywords to organise your collection. Press Enter or comma to add each one.', position: 'below' },
  { target: 'col-select-wrap', title: 'Collections', text: 'Assign this site to one or more collections to group related saves together.', position: 'above' },
];
let _modalTipStep = 0;

function startModalTips() {
  if (localStorage.getItem('sitesave-modal-tip')) return;
  _modalTipStep = 0;
  showModalTip();
}

function showModalTip() {
  removeModalTip();
  if (_modalTipStep >= MODAL_TIPS.length) { finishModalTips(); return; }
  const tip = MODAL_TIPS[_modalTipStep];
  const target = document.getElementById(tip.target);
  if (!target) { _modalTipStep++; showModalTip(); return; }

  const el = document.createElement('div');
  el.id = 'modal-tip';
  el.className = 'modal-tip';
  el.innerHTML = `
    <div class="ob-title">${tip.title}</div>
    <div class="ob-text">${tip.text}</div>
    <div class="ob-foot">
      <span class="ob-step">${_modalTipStep + 1} of ${MODAL_TIPS.length}</span>
      <button class="ob-btn" onclick="nextModalTip()">${_modalTipStep + 1 < MODAL_TIPS.length ? 'Next' : 'Done'}</button>
      <button class="ob-skip" onclick="finishModalTips()">Skip</button>
    </div>`;

  // Insert after the target element's parent fg div
  const fg = target.closest('.fg') || target.parentElement;
  fg.appendChild(el);
  target.classList.add('onboarding-highlight');
}

function nextModalTip() {
  const target = document.getElementById(MODAL_TIPS[_modalTipStep]?.target);
  if (target) target.classList.remove('onboarding-highlight');
  removeModalTip();
  _modalTipStep++;
  showModalTip();
}

function finishModalTips() {
  MODAL_TIPS.forEach(t => document.getElementById(t.target)?.classList.remove('onboarding-highlight'));
  removeModalTip();
  localStorage.setItem('sitesave-modal-tip', 'true');
}

function removeModalTip() {
  document.getElementById('modal-tip')?.remove();
}

// ── ONBOARDING TOOLTIPS ───────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    target: 'btn-save-site',
    title: 'Save any website',
    text: 'Paste a URL and Sitesave captures a screenshot automatically.',
    position: 'bottom-left',
  },
  {
    target: 'filter-btn',
    title: 'Filter your collection',
    text: 'Browse by favourites, tags, collections and more.',
    position: 'bottom-right',
    mobileOnly: true,
  },
  {
    target: 'sb-collections',
    title: 'Create collections',
    text: 'Group saved sites by project, client or theme — and share them with others.',
    position: 'right',
    desktopOnly: true,
  },
];

let _onboardingStep = 0;

function startOnboarding() {
  if (localStorage.getItem('sitesave-onboarded')) return;
  _onboardingStep = 0;
  showOnboardingStep();
}

function showOnboardingStep() {
  removeOnboardingTooltip();
  const isMobile = window.innerWidth <= 640;
  // Build list of applicable steps for this device
  const applicableSteps = ONBOARDING_STEPS.filter(s => {
    if (s.mobileOnly && !isMobile) return false;
    if (s.desktopOnly && isMobile) return false;
    return true;
  });
  if (_onboardingStep >= applicableSteps.length) { finishOnboarding(); return; }
  const step = applicableSteps[_onboardingStep];
  const total = applicableSteps.length;
  const current = _onboardingStep + 1;

  const target = document.getElementById(step.target);
  if (!target) { _onboardingStep++; showOnboardingStep(); return; }

  const tip = document.createElement('div');
  tip.id = 'onboarding-tip';
  tip.className = `onboarding-tip onboarding-${step.position}`;
  tip.innerHTML = `
    <div class="ob-title">${step.title}</div>
    <div class="ob-text">${step.text}</div>
    <div class="ob-foot">
      <span class="ob-step">${current} of ${total}</span>
      <button class="ob-btn" onclick="nextOnboardingStep()">
        ${current < total ? 'Next' : 'Done'}
      </button>
      <button class="ob-skip" onclick="finishOnboarding()">Skip</button>
    </div>`;

  document.body.appendChild(tip);

  // Position relative to target
  const rect = target.getBoundingClientRect();
  const tipW = 260;
  let top, left;

  if (step.position === 'bottom-left') {
    top = rect.bottom + 10;
    left = rect.left;
  } else if (step.position === 'bottom-right') {
    top = rect.bottom + 10;
    left = rect.right - tipW;
  } else if (step.position === 'right') {
    top = rect.top;
    left = rect.right + 12;
  }

  tip.style.top = Math.max(10, top) + 'px';
  tip.style.left = Math.max(10, Math.min(left, window.innerWidth - tipW - 10)) + 'px';

  // Highlight target
  target.classList.add('onboarding-highlight');
}

function nextOnboardingStep() {
  const isMobile = window.innerWidth <= 640;
  const applicableSteps = ONBOARDING_STEPS.filter(s => {
    if (s.mobileOnly && !isMobile) return false;
    if (s.desktopOnly && isMobile) return false;
    return true;
  });
  const target = applicableSteps[_onboardingStep]?.target;
  if (target) document.getElementById(target)?.classList.remove('onboarding-highlight');
  _onboardingStep++;
  showOnboardingStep();
}

function finishOnboarding() {
  removeOnboardingTooltip();
  ONBOARDING_STEPS.forEach(s => document.getElementById(s.target)?.classList.remove('onboarding-highlight'));
  localStorage.setItem('sitesave-onboarded', 'true');
  // Show keyboard shortcuts hint on desktop after onboarding
  if (window.innerWidth > 640) showKeyboardHint();
}

function removeOnboardingTooltip() {
  document.getElementById('onboarding-tip')?.remove();
}

function showKeyboardHint() {
  if (localStorage.getItem('sitesave-kb-hint')) return;
  if (window.innerWidth <= 640) return;
  const hint = document.createElement('div');
  hint.id = 'kb-hint';
  hint.className = 'kb-hint';
  hint.innerHTML = `
    <div class="kb-hint-title">Keyboard shortcuts</div>
    <div class="kb-hint-row"><kbd>N</kbd><span>Save a new site</span></div>
    <div class="kb-hint-row"><kbd>/</kbd><span>Search</span></div>
    <button class="kb-hint-close" onclick="dismissKeyboardHint()" title="Dismiss">✕</button>
  `;
  document.body.appendChild(hint);

  // Dismiss when user actually uses a shortcut
  const onKey = (e) => {
    if ((e.key === 'n' || e.key === '/') && e.target === document.body) {
      dismissKeyboardHint();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);
}

function dismissKeyboardHint() {
  document.getElementById('kb-hint')?.remove();
  localStorage.setItem('sitesave-kb-hint', 'true');
}
