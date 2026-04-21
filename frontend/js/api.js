// api.js — Centralised API client
// Sends JWT automatically via httpOnly cookie (credentials: 'include')

const BASE = '/api';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name   = 'ApiError';
  }
}

async function request(method, endpoint, body = null, skipAuthRedirect = false) {
  const opts = {
    method,
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  let res, data;
  try {
    res  = await fetch(BASE + endpoint, opts);
    data = await res.json();
  } catch (networkErr) {
    throw new ApiError('Network error — check your connection.', 0);
  }

  if (!res.ok) {
    // Only redirect to auth on 401 for protected routes, never for auth routes themselves
    if (res.status === 401 && !skipAuthRedirect && typeof currentUser !== 'undefined' && currentUser !== null) {
      currentUser = null;
      if (typeof showAuthScreen === 'function') showAuthScreen();
    }
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status);
  }

  return data;
}

const api = {
  // Auth  — skipAuthRedirect=true so a 401 here never loops
  login:         (email, password)              => request('POST',  '/auth/login',    { email, password }, true),
  register:      (name, email, password, phone) => request('POST',  '/auth/register', { name, email, password, phone }, true),
  logout:        ()                             => request('POST',  '/auth/logout',   null, true),
  me:            ()                             => request('GET',   '/auth/me',       null, true),
  updateProfile: (data)                         => request('PATCH', '/auth/profile',  data),

  // Groups
  getGroups:     ()                       => request('GET',    '/groups'),
  getGroup:      (id)                     => request('GET',    `/groups/${id}`),
  createGroup:   (data)                   => request('POST',   '/groups', data),
  deleteGroup:   (id)                     => request('DELETE', `/groups/${id}`),
  inviteMember:  (gid, email)             => request('POST',   `/groups/${gid}/invite`, { email }),
  respondInvite: (gid, iid, action)       => request('POST',   `/groups/${gid}/invite/${iid}/respond`, { action }),
  getBalances:   (id)                     => request('GET',    `/groups/${id}/balances`),

  // Expenses
  getExpenses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/expenses${qs ? '?' + qs : ''}`);
  },
  addExpense:    (data) => request('POST',   '/expenses',      data),
  getExpense:    (id)   => request('GET',    `/expenses/${id}`),
  deleteExpense: (id)   => request('DELETE', `/expenses/${id}`),
  getSummary:    ()     => request('GET',    '/expenses/summary'),

  // Settlements
  settle:         (data)    => request('POST', '/settlements',              data),
  getSettlements: (groupId) => request('GET',  `/settlements?groupId=${groupId}`),

  // Users
  searchUser:   (email) => request('GET', `/users/search?email=${encodeURIComponent(email)}`),
  getMyInvites: ()      => request('GET', '/users/invites'),
};
