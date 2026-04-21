// app.js — SplitEase frontend logic

// ── Global state ──────────────────────────────────────────
let currentUser   = null;
let currentPage   = 'dashboard';
let currentGroup  = null;
let expenseCtx    = 'personal';
let settleTarget  = null;
let selectedColor = '#7c6ef5';
let groupCache    = {};

// ── Constants ─────────────────────────────────────────────
const COLORS    = ['#7c6ef5','#3dd68c','#f5697c','#f5c842','#64a0ff','#a855f7','#fb923c','#22d3ee'];
const CAT_ICON  = { Food:'🍽️', Transport:'🚗', Shopping:'🛍️', Entertainment:'🎬', Health:'💊', Bills:'📄', Other:'📦' };
const CAT_CLASS = (c) => 'cat-' + (c || 'other').toLowerCase();

// ── Formatting helpers ────────────────────────────────────
const fmt   = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function timeAgo(ts) {
  const d = Date.now() - new Date(ts).getTime();
  if (d < 60000)    return 'just now';
  if (d < 3600000)  return Math.floor(d / 60000)   + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000)  + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatar(user, size = '2.2rem') {
  const bg  = user?.avatar || '#888';
  const ini = initials(user?.name || '');
  return `<div class="avatar" style="background:${bg};width:${size};height:${size}">${ini}</div>`;
}

function esc(str) {
  // Prevent XSS when inserting user-provided strings into innerHTML
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── UI helpers ────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3200);
}

function setBtn(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled    = loading;
  if (loading) { btn.dataset.orig = btn.textContent; btn.textContent = '···'; }
  else           btn.textContent  = btn.dataset.orig || btn.textContent;
}

// ── Auth screen ───────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
}

document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t  => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-form').classList.add('active');
    // Clear errors
    document.getElementById('login-error').textContent = '';
    document.getElementById('reg-error').textContent   = '';
  });
});

// ── Login ─────────────────────────────────────────────────
async function login() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }

  setBtn('login-btn', true);
  try {
    const { user } = await api.login(email, password);
    currentUser = user;
    bootApp();
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('login-btn', false);
  }
}

// ── Register ──────────────────────────────────────────────
async function register() {
  const name    = document.getElementById('reg-name').value.trim();
  const email   = document.getElementById('reg-email').value.trim();
  const pw      = document.getElementById('reg-password').value;
  const pw2     = document.getElementById('reg-password-confirm').value;
  const phone   = document.getElementById('reg-phone').value.trim().replace(/\D/g, '') || null;
  const errEl   = document.getElementById('reg-error');
  errEl.textContent = '';

  if (!name || !email || !pw || !pw2) { errEl.textContent = 'All fields except phone are required.'; return; }
  if (pw.length < 8)                  { errEl.textContent = 'Password must be at least 8 characters.'; return; }
  if (!/[A-Z]/.test(pw))              { errEl.textContent = 'Password needs at least one uppercase letter.'; return; }
  if (!/[0-9]/.test(pw))              { errEl.textContent = 'Password needs at least one number.'; return; }
  if (pw !== pw2)                     { errEl.textContent = 'Passwords do not match.'; return; }

  setBtn('reg-btn', true);
  try {
    const { user } = await api.register(name, email, pw, phone);
    currentUser = user;
    bootApp();
    showToast('Welcome, ' + name.split(' ')[0] + '! 🎉');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('reg-btn', false);
  }
}

// ── Logout ────────────────────────────────────────────────
async function logout() {
  try { await api.logout(); } catch { /* ignore */ }
  currentUser = null;
  groupCache  = {};
  currentGroup = null;
  showAuthScreen();
}

// ── Boot app after successful auth ────────────────────────
async function bootApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  // Greeting
  const hour  = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const grEl  = document.getElementById('dashboard-greeting');
  if (grEl) grEl.textContent = `${greet}, ${currentUser.name.split(' ')[0]}!`;

  // Sidebar user pill
  renderUserPill();

  // Set today's date as default on expense form
  document.getElementById('exp-date').value = new Date().toISOString().split('T')[0];

  renderColorPicker();
  await loadGroupNav();
  navigate('dashboard');
}

function renderUserPill() {
  document.getElementById('user-pill').innerHTML =
    `${avatar(currentUser, '2.2rem')}
     <div>
       <div style="font-size:.875rem;font-weight:600">${esc(currentUser.name.split(' ')[0])}</div>
       <div style="font-size:.72rem;color:var(--text3)">${esc(currentUser.email)}</div>
     </div>`;
}

// ── Navigation ────────────────────────────────────────────
async function navigate(page, groupId = null) {
  currentPage = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .group-nav-item').forEach(n => n.classList.remove('active'));

  const title = document.getElementById('topbar-title');
  document.getElementById('topbar-actions').innerHTML = '';

  if (page === 'dashboard') {
    document.getElementById('page-dashboard').classList.add('active');
    document.querySelector('[data-page="dashboard"]')?.classList.add('active');
    title.textContent = 'Dashboard';
    await renderDashboard();

  } else if (page === 'personal') {
    document.getElementById('page-personal').classList.add('active');
    document.querySelector('[data-page="personal"]')?.classList.add('active');
    title.textContent = 'Personal Expenses';
    await renderPersonalPage();

  } else if (page === 'group' && groupId) {
    document.getElementById('page-group').classList.add('active');
    await renderGroupPage(groupId);
    document.querySelectorAll('.group-nav-item').forEach(n => {
      if (n.dataset.id === groupId) n.classList.add('active');
    });
  }

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
}

// ── Sidebar group nav ─────────────────────────────────────
async function loadGroupNav() {
  try {
    const { groups } = await api.getGroups();
    groups.forEach(g => { groupCache[g._id] = g; });
    renderGroupNav(groups);
  } catch {
    renderGroupNav([]);
  }
}

function renderGroupNav(groups) {
  const el = document.getElementById('group-nav-list');
  if (!groups?.length) {
    el.innerHTML = '<div style="padding:.4rem .75rem;font-size:.8rem;color:var(--text3)">No groups yet</div>';
    return;
  }
  el.innerHTML = '';
  groups.forEach(g => {
    const item = document.createElement('div');
    item.className   = 'group-nav-item';
    item.dataset.id  = g._id;
    item.innerHTML   = `<div class="group-dot" style="background:${g.color}"></div><span>${esc(g.name)}</span>`;
    item.onclick     = () => navigate('group', g._id);
    el.appendChild(item);
  });
}

// ── Color picker ──────────────────────────────────────────
function renderColorPicker() {
  const picker = document.getElementById('group-color-picker');
  picker.innerHTML = '';
  COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (c === selectedColor ? ' selected' : '');
    sw.style.background = c;
    sw.onclick = () => {
      selectedColor = c;
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
    picker.appendChild(sw);
  });
}

// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  try {
    const [{ groups }, { expenses }, summary, { invites }] = await Promise.all([
      api.getGroups(),
      api.getExpenses({ limit: 10 }),
      api.getSummary(),
      api.getMyInvites(),
    ]);

    groups.forEach(g => { groupCache[g._id] = g; });
    renderGroupNav(groups);

    // Pending invites banner
    const banner = document.getElementById('pending-invites-banner');
    if (invites.length) {
      banner.innerHTML = `
        <div class="invite-section" style="margin-bottom:1.5rem">
          <h4>📬 ${invites.length} pending group invite${invites.length > 1 ? 's' : ''}</h4>
          ${invites.map(inv => `
            <div class="invite-item">
              <span class="invite-email"><strong>${esc(inv.groupName)}</strong> — by ${esc(inv.invitedBy?.name)}</span>
              <div>
                <button class="accept-btn" onclick="respondInvite('${inv.groupId}','${inv.inviteId}','accepted')">Accept</button>
                <button class="reject-btn" onclick="respondInvite('${inv.groupId}','${inv.inviteId}','rejected')">Decline</button>
              </div>
            </div>`).join('')}
        </div>`;
    } else {
      banner.innerHTML = '';
    }

    // Compute balances across all groups
    let totalOwed = 0, totalOwe = 0;
    await Promise.all(groups.map(async g => {
      try {
        const { balances } = await api.getBalances(g._id);
        const mine = balances.find(b => b.userId === currentUser._id);
        if (mine?.net > 0)  totalOwed += mine.net;
        if (mine?.net < 0)  totalOwe  += Math.abs(mine.net);
      } catch { /* skip group on error */ }
    }));

    const personalTotal = summary.personalByCategory?.reduce((s, c) => s + c.total, 0) || 0;

    document.getElementById('stats-grid').innerHTML = `
      <div class="stat-card purple">
        <div class="stat-label">Personal Spent</div>
        <div class="stat-value">${fmt(personalTotal)}</div>
        <div class="stat-sub">This month: ${fmt(summary.thisMonthPersonal || 0)}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">You Are Owed</div>
        <div class="stat-value">${fmt(totalOwed)}</div>
        <div class="stat-sub">Across ${groups.length} group${groups.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">You Owe</div>
        <div class="stat-value">${fmt(totalOwe)}</div>
        <div class="stat-sub">Net balance</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-label">Group Spending</div>
        <div class="stat-value">${fmt(summary.groupTotal || 0)}</div>
        <div class="stat-sub">${summary.groupCount || 0} group expenses</div>
      </div>`;

    // Recent activity
    const actEl = document.getElementById('recent-activity');
    if (!expenses.length) {
      actEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No activity yet</div></div>';
    } else {
      actEl.innerHTML = expenses.map(e => {
        const actor = e.paidBy || e.owner;
        const name  = actor?._id === currentUser._id ? 'You' : esc(actor?.name?.split(' ')[0] || '?');
        const grp   = e.group ? esc(groupCache[e.group]?.name || 'group') : 'personal';
        return `<div class="activity-item">
          <div class="activity-dot"></div>
          <div class="activity-text"><strong>${name}</strong> added <strong>${esc(e.title)}</strong> ${fmt(e.amount)} · ${grp}</div>
          <div class="activity-time">${timeAgo(e.createdAt)}</div>
        </div>`;
      }).join('');
    }

    // Groups list
    const grpEl = document.getElementById('dashboard-groups');
    if (!groups.length) {
      grpEl.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No groups yet. Create one!</div></div>';
    } else {
      grpEl.innerHTML = groups.map(g => `
        <div class="group-card" onclick="navigate('group','${g._id}')">
          <div class="group-icon" style="background:${g.color}22;color:${g.color}">◈</div>
          <div class="group-info">
            <div class="group-name">${esc(g.name)}</div>
            <div class="group-meta">${g.members.length} members · ${g.expenseCount} expense${g.expenseCount !== 1 ? 's' : ''}</div>
          </div>
          <div style="color:var(--text3);font-size:.8rem">${fmt(g.totalSpent)}</div>
        </div>`).join('');
    }

  } catch (e) {
    console.error('[Dashboard]', e);
    showToast('Failed to load dashboard: ' + e.message, 'error');
  }
}

// ── Personal page ─────────────────────────────────────────
async function renderPersonalPage() {
  try {
    const cat    = document.getElementById('personal-cat-filter').value;
    const params = { type: 'personal', limit: 100 };
    if (cat) params.category = cat;

    const [{ expenses }, summary] = await Promise.all([api.getExpenses(params), api.getSummary()]);

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const cats  = summary.personalByCategory || [];
    const top   = [...cats].sort((a, b) => b.total - a.total)[0];

    document.getElementById('personal-stats').innerHTML = `
      <div class="stat-card purple">
        <div class="stat-label">Total Spent</div>
        <div class="stat-value">${fmt(total)}</div>
        <div class="stat-sub">${expenses.length} expense${expenses.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-label">This Month</div>
        <div class="stat-value">${fmt(summary.thisMonthPersonal || 0)}</div>
        <div class="stat-sub">${new Date().toLocaleString('en', { month: 'long' })}</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Top Category</div>
        <div class="stat-value" style="font-size:1.1rem">${top ? esc(top._id) : '—'}</div>
        <div class="stat-sub">${top ? fmt(top.total) : 'No data'}</div>
      </div>`;

    const listEl = document.getElementById('personal-expense-list');
    if (!expenses.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-text">No expenses yet. Add one!</div></div>';
    } else {
      listEl.innerHTML = expenses.map(e => `
        <div class="expense-item" onclick="showExpenseDetail('${e._id}')">
          <div class="exp-icon ${CAT_CLASS(e.category)}">${CAT_ICON[e.category] || '📦'}</div>
          <div class="exp-info">
            <div class="exp-title">${esc(e.title)}</div>
            <div class="exp-meta">${esc(e.category)} · ${fmtDt(e.expenseDate)}</div>
          </div>
          <div class="exp-amount negative">${fmt(e.amount)}</div>
        </div>`).join('');
    }
  } catch (e) {
    console.error('[PersonalPage]', e);
    showToast('Failed to load expenses.', 'error');
  }
}

// ── Group page ────────────────────────────────────────────
async function renderGroupPage(groupId) {
  try {
    const [{ group }, { expenses }, { balances, transactions }] = await Promise.all([
      api.getGroup(groupId),
      api.getExpenses({ type: 'group', groupId, limit: 100 }),
      api.getBalances(groupId),
    ]);

    currentGroup = group;
    groupCache[group._id] = group;
    document.getElementById('topbar-title').textContent = group.name;

    const uid     = currentUser._id;
    const total   = expenses.reduce((s, e) => s + e.amount, 0);
    const myShare = expenses.reduce((s, e) => {
      const sp = e.splits?.find(x => x.user?._id === uid || x.user === uid);
      return s + (sp?.shareAmount || 0);
    }, 0);
    const iPaid   = expenses.filter(e => e.paidBy?._id === uid || e.paidBy === uid)
                            .reduce((s, e) => s + e.amount, 0);

    const pendingCount = group.invites?.filter(i => i.status === 'pending').length || 0;

    document.getElementById('group-page-header').innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.3rem">
          <div class="group-icon" style="background:${group.color}22;color:${group.color};width:2.8rem;height:2.8rem;font-size:1.3rem">◈</div>
          <h1 class="page-title">${esc(group.name)}</h1>
        </div>
        <p class="page-sub">${esc(group.description || 'Group expenses & splits')}</p>
      </div>
      ${group.owner._id === uid
        ? `<button class="btn-ghost" onclick="openModal('invite-modal')">+ Invite Member</button>`
        : ''}`;

    document.getElementById('group-stats').innerHTML = `
      <div class="stat-card purple">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value">${fmt(total)}</div>
        <div class="stat-sub">${expenses.length} expense${expenses.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Your Share</div>
        <div class="stat-value">${fmt(myShare)}</div>
        <div class="stat-sub">Your portion</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">You Paid</div>
        <div class="stat-value">${fmt(iPaid)}</div>
        <div class="stat-sub">On behalf of group</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-label">Members</div>
        <div class="stat-value">${group.members.length}</div>
        <div class="stat-sub">${pendingCount} pending invite${pendingCount !== 1 ? 's' : ''}</div>
      </div>`;

    // Expenses list
    const listEl = document.getElementById('group-expense-list');
    if (!expenses.length) {
      listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-text">No expenses yet.</div></div>';
    } else {
      listEl.innerHTML = expenses.map(e => {
        const payerName = (e.paidBy?._id === uid || e.paidBy === uid)
          ? 'You' : esc(e.paidBy?.name?.split(' ')[0] || '?');
        const per = e.splits?.[0]?.shareAmount ?? e.amount;
        return `
          <div class="expense-item" onclick="showExpenseDetail('${e._id}')">
            <div class="exp-icon ${CAT_CLASS(e.category)}">${CAT_ICON[e.category] || '📦'}</div>
            <div class="exp-info">
              <div class="exp-title">${esc(e.title)}</div>
              <div class="exp-meta">${payerName} paid · ${fmtDt(e.expenseDate)}</div>
            </div>
            <div>
              <div class="exp-amount neutral">${fmt(e.amount)}</div>
              <div style="font-size:.72rem;color:var(--text3);text-align:right">${fmt(per)}/person</div>
            </div>
          </div>`;
      }).join('');
    }

    // Balances
    const balEl = document.getElementById('group-balances');
    if (!transactions.length) {
      balEl.innerHTML = '<div class="empty-state" style="padding:1.5rem 0"><div class="empty-icon">✅</div><div class="empty-text">All settled up!</div></div>';
    } else {
      balEl.innerHTML = transactions.map(t => {
        const isMe  = t.from === uid;
        const tJson = JSON.stringify(t).replace(/"/g, '&quot;');
        return `
          <div class="balance-item">
            ${avatar({ name: t.fromName, avatar: t.fromAvatar })}
            <div class="balance-info">
              <span style="font-weight:600">${isMe ? 'You' : esc(t.fromName?.split(' ')[0])}</span>
              owe${isMe ? '' : 's'}
              <span style="font-weight:600">${t.to === uid ? 'you' : esc(t.toName?.split(' ')[0])}</span>
            </div>
            <div class="balance-amount ${isMe ? 'owe' : 'owed'}">${fmt(t.amount)}</div>
            ${isMe ? `<button class="settle-btn" onclick='openSettleModal(${tJson})'>Settle</button>` : ''}
          </div>`;
      }).join('');
    }

    // Members
    const memEl = document.getElementById('group-members');
    memEl.innerHTML = group.members.map(m => {
      const u = m.user;
      return `
        <div class="member-item">
          ${avatar(u)}
          <div class="member-info">
            <div class="member-name">${esc(u.name)}${u._id === uid ? ' <span style="color:var(--text3)">(you)</span>' : ''}</div>
            <div class="member-email">${esc(u.email)}</div>
          </div>
          ${m.role === 'owner' ? '<span class="member-badge">Owner</span>' : ''}
        </div>`;
    }).join('');

    const pending = group.invites?.filter(i => i.status === 'pending') || [];
    if (pending.length) {
      memEl.innerHTML += `
        <div style="margin-top:1rem;padding:.75rem;background:var(--yellow-bg);border-radius:8px;font-size:.8rem">
          <div style="color:var(--yellow);font-weight:600;margin-bottom:.5rem">⏳ Pending Invites</div>
          ${pending.map(i => `<div style="color:var(--text2);padding:.2rem 0">${esc(i.invitee?.email || '—')}</div>`).join('')}
        </div>`;
    }

  } catch (e) {
    console.error('[GroupPage]', e);
    showToast('Failed to load group: ' + e.message, 'error');
  }
}

// ── Modals ────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.querySelectorAll(`#${id} .form-error, #${id} .form-success`)
          .forEach(el => { el.textContent = ''; });
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOutside(e, id) { if (e.target.id === id) closeModal(id); }

// ── Create group ──────────────────────────────────────────
async function createGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  const desc = document.getElementById('new-group-desc').value.trim();
  const errEl = document.getElementById('create-group-error');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Group name is required.'; return; }

  setBtn('create-group-btn', true);
  try {
    const { group } = await api.createGroup({ name, description: desc, color: selectedColor });
    groupCache[group._id] = group;
    closeModal('create-group-modal');
    document.getElementById('new-group-name').value = '';
    document.getElementById('new-group-desc').value = '';
    await loadGroupNav();
    showToast(`Group "${name}" created!`);
    navigate('group', group._id);
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('create-group-btn', false);
  }
}

// ── Invite member ─────────────────────────────────────────
async function inviteMember() {
  const email = document.getElementById('invite-email').value.trim();
  const errEl = document.getElementById('invite-error');
  const sucEl = document.getElementById('invite-success');
  errEl.textContent = ''; sucEl.textContent = '';
  if (!email)        { errEl.textContent = 'Email is required.'; return; }
  if (!currentGroup) { errEl.textContent = 'No group selected.'; return; }

  setBtn('invite-btn', true);
  try {
    const { message } = await api.inviteMember(currentGroup._id, email);
    sucEl.textContent = message;
    document.getElementById('invite-email').value = '';
    showToast(message);
    await renderGroupPage(currentGroup._id);
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('invite-btn', false);
  }
}

// ── Respond to invite ─────────────────────────────────────
async function respondInvite(groupId, inviteId, action) {
  try {
    const { message } = await api.respondInvite(groupId, inviteId, action);
    showToast(message);
    await loadGroupNav();
    await renderDashboard();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Add expense modal ─────────────────────────────────────
function openAddExpenseModal(ctx) {
  expenseCtx = ctx;
  document.getElementById('expense-modal-title').textContent =
    ctx === 'group' ? 'Add Group Expense' : 'Add Personal Expense';

  const section = document.getElementById('exp-split-section');
  if (ctx === 'group' && currentGroup) {
    section.style.display = 'block';
    document.getElementById('exp-split-members').innerHTML =
      currentGroup.members.map(m => {
        const u = m.user;
        return `<div class="split-member">
          <input type="checkbox" id="spl-${u._id}" value="${u._id}" checked onchange="updateSplitInfo()"/>
          <label for="spl-${u._id}">
            ${avatar(u, '1.6rem')}
            ${esc(u.name)}${u._id === currentUser._id ? ' (you)' : ''}
          </label>
        </div>`;
      }).join('');
    updateSplitInfo();
  } else {
    section.style.display = 'none';
  }
  openModal('add-expense-modal');
}

function updateSplitInfo() {
  const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
  const count  = document.querySelectorAll('#exp-split-members input:checked').length;
  document.getElementById('split-info-text').textContent =
    count > 0 && amount > 0
      ? `Each pays ${fmt(amount / count)} — split equally among ${count} member${count > 1 ? 's' : ''}`
      : 'Select at least one member';
}

async function addExpense() {
  const title    = document.getElementById('exp-title').value.trim();
  const amount   = parseFloat(document.getElementById('exp-amount').value);
  const category = document.getElementById('exp-category').value;
  const date     = document.getElementById('exp-date').value;
  const note     = document.getElementById('exp-note').value.trim();
  const errEl    = document.getElementById('add-expense-error');
  errEl.textContent = '';

  if (!title)          { errEl.textContent = 'Title is required.';      return; }
  if (!amount || amount <= 0) { errEl.textContent = 'Enter a valid amount.'; return; }
  if (!date)           { errEl.textContent = 'Date is required.';        return; }

  const payload = { type: expenseCtx, title, amount, category, expenseDate: date, note };

  if (expenseCtx === 'group') {
    const splitAmong = Array.from(
      document.querySelectorAll('#exp-split-members input:checked')
    ).map(c => c.value);
    if (!splitAmong.length) { errEl.textContent = 'Select at least one member.'; return; }
    payload.groupId    = currentGroup._id;
    payload.splitAmong = splitAmong;
  }

  setBtn('add-expense-btn', true);
  try {
    await api.addExpense(payload);
    closeModal('add-expense-modal');
    document.getElementById('exp-title').value  = '';
    document.getElementById('exp-note').value   = '';
    document.getElementById('exp-amount').value = '';
    document.getElementById('exp-date').value   = new Date().toISOString().split('T')[0];
    showToast(`"${title}" added!`);
    if (expenseCtx === 'personal') await renderPersonalPage();
    else                           await renderGroupPage(currentGroup._id);
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('add-expense-btn', false);
  }
}

// ── Expense detail ────────────────────────────────────────
async function showExpenseDetail(expId) {
  try {
    const { expense: e } = await api.getExpense(expId);
    const uid = currentUser._id;

    let html = `
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;padding:1rem;background:var(--surface2);border-radius:10px">
        <div class="exp-icon ${CAT_CLASS(e.category)}" style="width:3rem;height:3rem;font-size:1.4rem">${CAT_ICON[e.category] || '📦'}</div>
        <div>
          <div style="font-family:var(--font-display);font-size:1.1rem;font-weight:700">${esc(e.title)}</div>
          <div style="color:var(--text2);font-size:.8rem">${esc(e.category)} · ${fmtDt(e.expenseDate)}</div>
        </div>
        <div style="margin-left:auto;font-family:var(--font-display);font-size:1.3rem;font-weight:700;color:var(--accent)">${fmt(e.amount)}</div>
      </div>
      <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${e.type === 'group' ? '👥 Group' : '👤 Personal'}</span></div>`;

    if (e.group)   html += `<div class="detail-row"><span class="detail-label">Group</span><span class="detail-value">${esc(e.group.name)}</span></div>`;
    if (e.paidBy)  html += `<div class="detail-row"><span class="detail-label">Paid By</span><span class="detail-value">${esc(e.paidBy.name)}</span></div>`;

    if (e.splits?.length) {
      const names = e.splits.map(s => esc(s.user?.name?.split(' ')[0] || '?')).join(', ');
      html += `
        <div class="detail-row"><span class="detail-label">Split Among</span><span class="detail-value">${names}</span></div>
        <div class="detail-row"><span class="detail-label">Per Person</span><span class="detail-value" style="color:var(--red)">${fmt(e.splits[0].shareAmount)}</span></div>`;
    }
    if (e.note) html += `<div class="detail-row"><span class="detail-label">Note</span><span class="detail-value">${esc(e.note)}</span></div>`;

    document.getElementById('expense-detail-content').innerHTML = html;

    const canDelete = e.owner?._id === uid || e.paidBy?._id === uid;
    const delBtn    = document.getElementById('delete-expense-btn');
    delBtn.style.display = canDelete ? 'inline-flex' : 'none';
    delBtn.onclick = () => deleteExpense(expId, e.type === 'group' ? e.group?._id : null);

    openModal('expense-detail-modal');
  } catch {
    showToast('Could not load expense.', 'error');
  }
}

async function deleteExpense(id, groupId) {
  try {
    await api.deleteExpense(id);
    closeModal('expense-detail-modal');
    showToast('Expense deleted.', 'error');
    if (groupId) await renderGroupPage(groupId);
    else         await renderPersonalPage();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Settle up ─────────────────────────────────────────────
function openSettleModal(t) {
  settleTarget = t;
  document.getElementById('settle-content').innerHTML = `
    <p style="color:var(--text2);margin-bottom:1.25rem;font-size:.9rem">Record this payment as settled:</p>
    <div class="settle-row">
      ${avatar({ name: t.fromName, avatar: t.fromAvatar })}
      <div><div style="font-weight:600">${esc(t.fromName)}</div><div style="color:var(--text3);font-size:.8rem">pays</div></div>
      <div class="settle-arrow">→</div>
      <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--green)">${fmt(t.amount)}</div>
      <div class="settle-arrow">→</div>
      ${avatar({ name: t.toName, avatar: t.toAvatar })}
      <div><div style="font-weight:600">${esc(t.toName)}</div></div>
    </div>`;
  document.getElementById('settle-error').textContent = '';
  openModal('settle-modal');
}

async function confirmSettle() {
  if (!settleTarget || !currentGroup) return;
  setBtn('settle-btn', true);
  try {
    await api.settle({ groupId: currentGroup._id, toUserId: settleTarget.to, amount: settleTarget.amount });
    closeModal('settle-modal');
    showToast('Settlement recorded! ✓');
    await renderGroupPage(currentGroup._id);
    settleTarget = null;
  } catch (e) {
    document.getElementById('settle-error').textContent = e.message;
  } finally {
    setBtn('settle-btn', false);
  }
}

// ── Sidebar ───────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

// ── Profile & WhatsApp settings ───────────────────────────
function openProfileModal() {
  document.getElementById('profile-name').value         = currentUser.name || '';
  document.getElementById('profile-phone').value        = currentUser.phone || '';
  document.getElementById('profile-wa-enabled').checked = currentUser.whatsappEnabled !== false;
  openModal('profile-modal');
}

async function saveProfile() {
  const name            = document.getElementById('profile-name').value.trim();
  const phone           = document.getElementById('profile-phone').value.trim().replace(/\D/g, '');
  const whatsappEnabled = document.getElementById('profile-wa-enabled').checked;
  const errEl           = document.getElementById('profile-error');
  const sucEl           = document.getElementById('profile-success');
  errEl.textContent = ''; sucEl.textContent = '';

  if (!name) { errEl.textContent = 'Name cannot be empty.'; return; }

  setBtn('profile-save-btn', true);
  try {
    const { user } = await api.updateProfile({ name, phone: phone || null, whatsappEnabled });
    currentUser = user;
    renderUserPill();
    sucEl.textContent = phone && whatsappEnabled
      ? '✅ Saved! WhatsApp notifications are ON.'
      : '✅ Saved! WhatsApp notifications are OFF.';
    showToast('Profile updated!');
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    setBtn('profile-save-btn', false);
  }
}

// ── Keyboard shortcuts ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const form = document.querySelector('.auth-form.active');
    if (form?.id === 'login-form')    login();
    else if (form?.id === 'register-form') register();
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ── Boot: restore session ─────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const { user } = await api.me();
    currentUser = user;
    await bootApp();
  } catch {
    // No active session — show auth screen (already visible by default)
  }
});
