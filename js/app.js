/* Mazaya Season Travel - shared front-end script */

/* --- Language (EN / AR + RTL) --- */
const lang = localStorage.getItem('mz-lang') || 'en';
function setLang(l){
  localStorage.setItem('mz-lang', l);
  document.body.classList.toggle('rtl', l === 'ar');
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}
setLang(lang);

/* --- Path helpers ---
   Pages in /pages/ and /admin/ live one level below the site root,
   so links from them need a "../" prefix. */
function basePath(){
  return (location.pathname.includes('/pages/') || location.pathname.includes('/admin/')) ? '../' : '';
}
function pageUrl(file){
  return location.pathname.includes('/pages/') ? file : 'pages/' + file;
}

/* --- Shared header & footer ---
   Single source of truth. Any page with <div id="site-header"></div> or
   <div id="site-footer"></div> gets the standard chrome injected here, so
   the navigation only needs to be edited in one place. */
function renderChrome(){
  const b = basePath();
  const header = document.getElementById('site-header');
  if (header){
    header.outerHTML = `
<header class="topbar"><div class="container nav"><a class="brand" href="${b}index.html"><img src="${b}assets/logo/mazaya-logo.jpg"><span>Mazaya Season Travel</span></a><nav class="navlinks"><a href="${b}index.html">Home</a><a href="${b}pages/results.html">Flights</a><a href="${b}pages/hotels.html">Hotels</a><a href="${b}pages/tours.html">Tours</a><a href="${b}pages/visas.html">Visas</a><a href="${b}pages/deals.html">Deals</a><a href="${b}pages/account.html">Account</a><button class="btn ghost" data-lang="en">EN</button><button class="btn ghost" data-lang="ar">AR</button><a class="btn primary" href="${b}pages/login.html">Login</a></nav></div></header>`;
  }
  const footer = document.getElementById('site-footer');
  if (footer){
    footer.outerHTML = `
<footer class="footer"><div class="container footer-grid"><div><h3>Mazaya Season Travel</h3><p>Flights, hotels, tours, visas and seasonal deals from Abu Dhabi to the world.</p></div><div><h4>Company</h4><p><a href="${b}pages/about.html">About us</a></p><p><a href="${b}pages/contact.html">Contact</a></p><p><a href="${b}pages/faq.html">FAQ</a></p></div><div><h4>Legal</h4><p><a href="${b}pages/terms.html">Terms</a></p><p><a href="${b}pages/privacy.html">Privacy</a></p><p><a href="${b}pages/refund-policy.html">Refund policy</a></p></div><div><h4>Support</h4><p>Abu Dhabi, Al Wahda Street</p><p>600557777</p></div></div></footer>`;
  }
}
renderChrome();

/* --- Delegated interactions (work for injected elements too) --- */
document.addEventListener('click', e => {
  if (e.target.matches('[data-lang]')) setLang(e.target.dataset.lang);
  if (e.target.matches('[data-book]')) location.href = pageUrl('checkout.html');
  if (e.target.matches('[data-search]')) location.href = pageUrl('results.html');
});

/* --- Toast helper --- */
function toast(msg){
  let t = document.createElement('div');
  t.textContent = msg;
  t.style = 'position:fixed;right:20px;bottom:20px;background:#102A57;color:white;padding:14px 18px;border-radius:14px;z-index:99;box-shadow:0 12px 40px #0003';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* --- Real login (talks to the backend API) ---
   These call the Node/Express + PostgreSQL backend in /server. The site must
   be served by that backend (e.g. http://localhost:4000) for the API to be
   reachable; opened as plain files the calls will simply fail with a message. */
async function api(path, body){
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body || {})
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

async function requestOtp(){
  const id = (document.getElementById('login-id') || {}).value || '';
  let r;
  try { r = await api('/api/auth/request-otp', { identifier: id }); }
  catch (e) { toast('Cannot reach the server. Is the backend running?'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not send code'); return; }
  if (r.data.devCode){
    const otp = document.getElementById('login-otp');
    if (otp) otp.value = r.data.devCode;
    toast('Dev code: ' + r.data.devCode);
  } else {
    toast('Verification code sent');
  }
}

async function verifyOtp(){
  const id = (document.getElementById('login-id') || {}).value || '';
  const code = (document.getElementById('login-otp') || {}).value || '';
  let r;
  try { r = await api('/api/auth/verify-otp', { identifier: id, code }); }
  catch (e) { toast('Cannot reach the server. Is the backend running?'); return; }
  if (!r.ok){ toast(r.data.error || 'Invalid code'); return; }
  location.href = 'account.html';
}

/* Protect the account page: if there is no valid session, send the visitor to
   login. When the site is opened as plain files (no backend), the request
   fails and we leave the demo page untouched. */
async function guardAccount(){
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok){ location.href = 'login.html'; }
  } catch (e) { /* no backend available - leave the demo page as-is */ }
}
if (location.pathname.endsWith('/account.html')) guardAccount();

/* ============================================================================
   Phase 2 — Visas + payments (talks to the /api endpoints in /server)
   ========================================================================= */

async function apiGet(path){
  const res = await fetch(path, { credentials: 'include' });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}
async function apiUpload(path, files){
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  const res = await fetch(path, { method: 'POST', credentials: 'include', body: fd });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

/* Return the logged-in user, or null. */
async function currentUser(){
  try { const r = await apiGet('/api/auth/me'); return r.ok ? r.data.user : null; }
  catch (e) { return null; }
}
/* Redirect to login unless there is a session. Returns the user, or null if it
   redirected (callers should stop). */
async function requireSession(){
  const u = await currentUser();
  if (!u){ location.href = 'login.html'; return null; }
  return u;
}

const VISA_STATUS_LABEL = {
  awaiting_payment: 'Awaiting payment',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};
function statusBadge(s){ return `<span class="badge">${VISA_STATUS_LABEL[s] || s}</span>`; }
function money(amount, currency){
  return (currency || 'AED') + ' ' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* --- New visa application form (pages/visas.html) --- */
async function initVisaForm(){
  if (!(await requireSession())) return;
  const sel = document.getElementById('visa-type');
  const r = await apiGet('/api/visa-types');
  if (r.ok && sel){
    sel.innerHTML = r.data.visaTypes
      .map(t => `<option value="${t.code}">${esc(t.name)} — ${esc(money(t.price, t.currency))}</option>`)
      .join('');
  }
}
async function submitVisaRequest(){
  const body = {
    visaTypeCode: (document.getElementById('visa-type') || {}).value,
    applicantName: (document.getElementById('visa-applicant') || {}).value,
    nationality: (document.getElementById('visa-nationality') || {}).value,
    passportNumber: (document.getElementById('visa-passport') || {}).value,
    travelDate: (document.getElementById('visa-date') || {}).value,
  };
  let r;
  try { r = await api('/api/visas', body); }
  catch (e) { toast('Cannot reach the server. Is the backend running?'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not submit request'); return; }
  toast('Request created — add documents and pay');
  location.href = 'visa-status.html';
}

/* --- My visa requests (pages/visa-status.html) --- */
async function initVisaStatus(){
  if (!(await requireSession())) return;
  await renderVisaList();
}
async function renderVisaList(){
  const wrap = document.getElementById('visa-list');
  if (!wrap) return;
  const r = await apiGet('/api/visas');
  if (!r.ok){ wrap.innerHTML = '<div class="card pad">Could not load your requests.</div>'; return; }
  const requests = r.data.requests || [];
  if (!requests.length){
    wrap.innerHTML = '<div class="card pad">No visa requests yet. <a href="visas.html">Start one</a>.</div>';
    return;
  }
  wrap.innerHTML = requests.map(req => {
    const payable = req.status === 'awaiting_payment';
    const price = req.type ? money(req.type.price, req.type.currency) : '';
    return `<div class="card pad" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h3 style="margin:0">${esc(req.type ? req.type.name : 'Visa')}</h3>
          <p style="margin:4px 0;color:#667">${esc(req.applicantName)} · ${esc(req.type ? req.type.country : '')} · ${esc(price)}</p></div>
        <div>${statusBadge(req.status)}</div>
      </div>
      ${req.adminNote ? `<p style="margin:8px 0;color:#667"><b>Note from our team:</b> ${esc(req.adminNote)}</p>` : ''}
      ${payable ? `
        <div class="field" style="margin-top:12px"><label>Add documents (passport, photo — PDF or image)</label>
          <input type="file" id="files-${req.id}" multiple accept="application/pdf,image/*"></div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <button class="btn ghost" data-upload="${req.id}">Upload documents</button>
          <button class="btn primary" data-pay="${req.id}">Pay ${esc(price)}</button>
        </div>` : ''}
    </div>`;
  }).join('');
}
async function uploadVisaDocs(id){
  const input = document.getElementById('files-' + id);
  if (!input || !input.files.length){ toast('Choose at least one file first'); return; }
  const r = await apiUpload(`/api/visas/${id}/documents`, input.files);
  if (!r.ok){ toast(r.data.error || 'Upload failed'); return; }
  toast(`${r.data.documents.length} document(s) uploaded`);
  renderVisaList();
}
async function payVisa(id){
  let r;
  try { r = await api(`/api/payments/visa/${id}/checkout`, {}); }
  catch (e) { toast('Cannot reach the server.'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not start payment'); return; }
  location.href = r.data.redirectUrl; // hosted payment page (simulated in dev)
}

/* --- Simulated hosted payment page (pages/visa-pay.html) --- */
async function initVisaPay(){
  if (!(await requireSession())) return;
  const ref = new URLSearchParams(location.search).get('ref');
  const box = document.getElementById('pay-box');
  if (!ref || !box){ if (box) box.innerHTML = 'Missing payment reference.'; return; }
  const r = await apiGet('/api/payments/' + encodeURIComponent(ref));
  if (!r.ok){ box.innerHTML = 'Payment not found.'; return; }
  const p = r.data.payment;
  box.innerHTML = `
    <p class="price">${esc(money(p.amount, p.currency))}</p>
    <p style="color:#667">Test payment — no real card is charged.</p>
    ${p.status === 'paid'
      ? '<p>This payment is already complete.</p><a class="btn primary" href="visa-status.html">Back to my visas</a>'
      : `<button class="btn primary" id="pay-confirm">Pay now (TEST)</button>
         <a class="btn ghost" href="visa-status.html" style="margin-left:10px">Cancel</a>`}`;
  const btn = document.getElementById('pay-confirm');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    const c = await api(`/api/payments/${encodeURIComponent(ref)}/confirm`, {});
    if (!c.ok){ toast(c.data.error || 'Payment failed'); btn.disabled = false; return; }
    toast('Payment successful');
    location.href = 'visa-status.html';
  });
}

/* --- Admin visa queue (admin/index.html) --- */
async function initAdminVisas(){
  const wrap = document.getElementById('admin-visa-queue');
  if (!wrap) return;
  const u = await currentUser();
  if (!u || u.role !== 'admin'){
    wrap.innerHTML = '<div class="card pad">Admin sign-in required. <a href="../pages/login.html">Login</a> with an admin account.</div>';
    return;
  }
  await renderAdminVisas();
}
async function renderAdminVisas(){
  const wrap = document.getElementById('admin-visa-queue');
  const r = await apiGet('/api/admin/visas');
  if (!r.ok){ wrap.innerHTML = 'Could not load the visa queue.'; return; }
  const rows = (r.data.requests || []).map(req => `
    <tr>
      <td>#${req.id}</td>
      <td>${esc(req.applicantName)}<br><small style="color:#889">${esc(req.customer.email || req.customer.mobile || '')}</small></td>
      <td>${esc(req.type.name)}</td>
      <td>${esc(money(req.type.price, req.type.currency))}<br><small style="color:#889">${esc(req.payment ? req.payment.status : 'unpaid')}</small></td>
      <td>${statusBadge(req.status)}</td>
      <td>
        <button class="btn ghost" data-admin-set="in_review" data-id="${req.id}">Review</button>
        <button class="btn primary" data-admin-set="approved" data-id="${req.id}">Approve</button>
        <button class="btn ghost" data-admin-set="rejected" data-id="${req.id}">Reject</button>
      </td>
    </tr>`).join('');
  wrap.innerHTML = `<table class="table"><tr><th>Ref</th><th>Applicant</th><th>Visa</th><th>Price / payment</th><th>Status</th><th>Action</th></tr>${rows || '<tr><td colspan="6">No requests yet.</td></tr>'}</table>`;
}
async function adminSetStatus(id, status){
  const res = await fetch(`/api/admin/visas/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok){ toast('Update failed'); return; }
  toast('Updated to ' + (VISA_STATUS_LABEL[status] || status));
  renderAdminVisas();
}

/* Delegated clicks for the Phase 2 pages (buttons are injected dynamically). */
document.addEventListener('click', e => {
  const up = e.target.closest('[data-upload]'); if (up) uploadVisaDocs(up.dataset.upload);
  const pay = e.target.closest('[data-pay]'); if (pay) payVisa(pay.dataset.pay);
  const adm = e.target.closest('[data-admin-set]'); if (adm) adminSetStatus(adm.dataset.id, adm.dataset.adminSet);
});

/* Page routing */
const path = location.pathname;
if (path.endsWith('/visas.html')) initVisaForm();
if (path.endsWith('/visa-status.html')) initVisaStatus();
if (path.endsWith('/visa-pay.html')) initVisaPay();
if (path.includes('/admin/')) initAdminVisas();
