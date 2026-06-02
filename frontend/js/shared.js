// ─── API base ─────────────────────────────────────────────────────────────────
const API = '/api';

// ─── Storage ──────────────────────────────────────────────────────────────────
const getToken  = () => localStorage.getItem('qc_token');
const getUser   = () => { try { return JSON.parse(localStorage.getItem('qc_user')); } catch { return null; } };
const setAuth   = (t, u) => { localStorage.setItem('qc_token', t); localStorage.setItem('qc_user', JSON.stringify(u)); };
const clearAuth = () => { localStorage.removeItem('qc_token'); localStorage.removeItem('qc_user'); };

const requireAuth    = () => { if (!getToken()) { location.href = '/login'; return false; } return true; };
const requireAdmin   = () => { const u = getUser(); if (!u || u.role !== 'admin')   { location.href = '/dashboard'; return false; } return true; };
const requireCreator = () => { const u = getUser(); if (!u || !['admin','creator'].includes(u.role)) { location.href = '/dashboard'; return false; } return true; };

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res  = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) { clearAuth(); location.href = '/login'; throw new Error('Unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}
const apiGet    = p      => apiFetch(p);
const apiPost   = (p, b) => apiFetch(p, { method: 'POST',   body: JSON.stringify(b) });
const apiPut    = (p, b) => apiFetch(p, { method: 'PUT',    body: JSON.stringify(b) });
const apiDelete = p      => apiFetch(p, { method: 'DELETE' });

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'inf') {
  const icons = { ok: '✓', err: '✕', inf: 'i', warn: '!' };
  const colors = { ok: 'var(--success)', err: 'var(--danger)', inf: 'var(--primary)', warn: 'var(--warning)' };
  let box = document.getElementById('toast-box');
  if (!box) { box = document.createElement('div'); box.id = 'toast-box'; box.className = 'toast-box'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon" style="background:${colors[type]||colors.inf}">${icons[type]||icons.inf}</span><span>${escHtml(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.style.cssText = 'opacity:0;transform:translateX(90px);transition:.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const escHtml = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate = d => {
  if (!d) return '—';
  // Parse as local date to avoid UTC timezone offset (avoids off-by-one day bug)
  const s = String(d).split('T')[0]; // take YYYY-MM-DD part only
  const [y, m, day] = s.split('-').map(Number);
  if (y && m && day) {
    const local = new Date(y, m - 1, day); // local midnight, no UTC conversion
    return local.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const timeAgo = d => {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
const isOverdue = d => {
  if (!d) return false;
  const s = String(d).split('T')[0];
  const [y, m, day] = s.split('-').map(Number);
  if (y && m && day) {
    const due = new Date(y, m - 1, day); // local date
    const today = new Date(); today.setHours(0,0,0,0);
    return due < today;
  }
  return false;
};
const statusTxt  = s => ({ not_started:'Not Started', in_progress:'In Progress', review:'In Review',
  attention:'Needs Attention', completed:'Completed', submitted:'Submitted', draft:'Draft',
  returned:'Returned for Changes', resubmitted:'Resubmitted', reviewed:'Review Completed' }[s] || s);
const roleBadge  = r => ({ admin: 'Admin', creator: 'Creator', respondent: 'Respondent' }[r] || r);
const roleColor  = r => ({ admin: 'var(--purple)', creator: 'var(--primary)', respondent: 'var(--success)' }[r] || 'var(--txt-3)');

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function renderSidebar(activePage) {
  const u = getUser();
  if (!u) return;

  const navMap = {
    admin: [
      { page: 'dashboard',     icon: 'home',          label: 'Dashboard'     },
      { page: 'admin',         icon: 'shield',        label: 'Admin Panel'   },
      { page: 'analytics',     icon: 'bar-chart-2',   label: 'Analytics'     },
      { page: 'questionnaire', icon: 'clipboard-list',label: 'Questionnaire' },
      { page: 'settings',      icon: 'settings',      label: 'Settings'      },
      { page: 'profile',       icon: 'user',          label: 'Profile'       },
    ],
    creator: [
      { page: 'dashboard',     icon: 'home',          label: 'Dashboard'     },
      { page: 'analytics',     icon: 'bar-chart-2',   label: 'Analytics'     },
      { page: 'questionnaire', icon: 'clipboard-list',label: 'Questionnaire' },
      { page: 'settings',      icon: 'settings',      label: 'Settings'      },
      { page: 'profile',       icon: 'user',          label: 'Profile'       },
    ],
    respondent: [
      { page: 'dashboard',     icon: 'home',          label: 'Dashboard'     },
      { page: 'questionnaire', icon: 'clipboard-list',label: 'My Forms'      },
      { page: 'profile',       icon: 'user',          label: 'Profile'       },
    ],
  };

  const items = navMap[u.role] || navMap.respondent;
  const sbNav = document.getElementById('sb-nav');
  if (sbNav) {
    sbNav.innerHTML = items.map(n =>
      `<a class="nav-item ${activePage === n.page ? 'active' : ''}" href="/${n.page}">
        ${icon(n.icon,"currentColor",18)}<span>${n.label}</span>
       </a>`
    ).join('');
  }

  const avatarEl = document.getElementById('sb-avatar');
  const unameEl  = document.getElementById('sb-uname');
  const uroleEl  = document.getElementById('sb-urole');
  if (avatarEl) avatarEl.textContent = u.name.charAt(0).toUpperCase();
  if (unameEl)  unameEl.textContent  = u.name;
  if (uroleEl)  uroleEl.innerHTML    = `<span class="role-chip" style="color:${roleColor(u.role)};background:${roleColor(u.role)}1a">${roleBadge(u.role)}</span>`;

  // Initialize Lucide icons after rendering
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Mobile: inject top bar and overlay if not present
  if (!document.getElementById('mob-topbar')) {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebar-overlay';
    overlay.onclick = closeMobileSidebar;
    document.body.appendChild(overlay);

    const main = document.querySelector('.main');
    if (main) {
      const topbar = document.createElement('div');
      topbar.className = 'mob-topbar';
      topbar.id = 'mob-topbar';
      topbar.innerHTML = `
        <button class="mob-menu-btn" onclick="toggleMobileSidebar()" aria-label="Menu">
          ${icon("menu","currentColor",18)}
        </button>
        <div class="mob-topbar-title">Query<span style="color:var(--primary)">Craft</span></div>
        <div class="avatar" style="width:32px;height:32px;font-size:.78rem;cursor:pointer" onclick="location.href='/profile'">${u.name.charAt(0).toUpperCase()}</div>`;
      main.insertBefore(topbar, main.firstChild);
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }
}

function toggleMobileSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.toggle('open');
  if (ov) ov.classList.toggle('show');
}

function closeMobileSidebar() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('show');
}

// Close sidebar when nav item clicked on mobile
document.addEventListener('click', e => {
  if (e.target.closest('.nav-item') && window.innerWidth <= 768) {
    closeMobileSidebar();
  }
});

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(html, cls = '') {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = '__modal';
  ov.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  document.body.appendChild(ov);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
function closeModal() { document.getElementById('__modal')?.remove(); }

function confirmModal(title, text, onOk, okLabel = 'Delete', okClass = 'btn-danger') {
  openModal(`
    <div class="confirm-wrap">
      <div class="confirm-ico">${icon("alert-triangle","currentColor",44)}</div>
      <div class="confirm-title">${escHtml(title)}</div>
      <div class="confirm-txt">${escHtml(text)}</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn ${okClass}" id="cfm-ok">${escHtml(okLabel)}</button>
      </div>
    </div>`, 'modal-sm');
  document.getElementById('cfm-ok').onclick = () => { onOk(); closeModal(); };
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── Back button helper ───────────────────────────────────────────────────────
function goBack(fallback = '/dashboard') {
  if (document.referrer && document.referrer !== window.location.href) {
    history.back();
  } else {
    location.href = fallback;
  }
}

// ─── Inline SVG Icon Helper ────────────────────────────────────────────────────
// Returns an inline SVG for the given icon name. No dependency on lucide.createIcons().
const ICONS = {
  'activity':        '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'alert-circle':    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  'alert-triangle':  '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'arrow-left':      '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  'arrow-right':     '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'bar-chart-2':     '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  'calendar':        '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  'check-circle':    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'clipboard-list':  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/><polyline points="9 8 10 9 12 7"/>',
  'clock':           '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'edit-2':          '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  'edit-3':          '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  'eye':             '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'file-edit':       '<path d="M4 13.5V4a2 2 0 0 1 2-2h8.5L20 7.5V20a2 2 0 0 1-2 2h-5.5"/><polyline points="14 2 14 8 20 8"/><path d="M10.42 12.61a2.1 2.1 0 1 1 2.97 2.97L7.95 21 4 22l.99-3.95 5.43-5.44Z"/>',
  'file-plus':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>',
  'file-text':       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  'layout-template': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
  'loader':          '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>',
  'log-out':         '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'menu':            '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  'minus-circle':    '<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>',
  'more-horizontal': '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  'percent':         '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  'plus':            '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'refresh-cw':      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  'scroll-text':     '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-2h2"/><path d="M16 8h4a2 2 0 0 0 0-4H4a2 2 0 0 0 0 4h8v6"/><line x1="8" y1="13" x2="4" y2="13"/>',
  'search':          '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'send':            '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  'settings':        '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  'shield':          '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'sparkles':        '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.287 1.288L3 12l5.8 1.9a2 2 0 0 1 1.288 1.287L12 21l1.9-5.8a2 2 0 0 1 1.287-1.288L21 12l-5.8-1.9a2 2 0 0 1-1.288-1.287Z"/>',
  'table':           '<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
  'trash-2':         '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  'user':            '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'user-check':      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  'users':           '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'wifi-off':        '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  'home':            '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
};

function icon(name, color, size) {
  size = size || 18;
  const paths = ICONS[name] || '<circle cx="12" cy="12" r="10"/>';
  const col = color || 'currentColor';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;flex-shrink:0">${paths}</svg>`;
}
