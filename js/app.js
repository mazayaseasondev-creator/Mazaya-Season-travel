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

const STATUS_LABEL = {
  awaiting_payment: 'Awaiting payment',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
};
const VISA_STATUS_LABEL = STATUS_LABEL; // back-compat alias
function statusBadge(s){ return `<span class="badge">${STATUS_LABEL[s] || s}</span>`; }
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

/* --- Simulated hosted payment page (pages/pay.html), shared by every product --- */
function paymentReturnPage(kind){
  if (kind === 'hotel') return 'hotel-bookings.html';
  if (kind === 'flight') return 'flight-bookings.html';
  if (kind === 'tour') return 'tour-bookings.html';
  return 'visa-status.html';
}
function fmtDateTime(iso){
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (e) { return iso; }
}
async function initPay(){
  if (!(await requireSession())) return;
  const ref = new URLSearchParams(location.search).get('ref');
  const box = document.getElementById('pay-box');
  if (!ref || !box){ if (box) box.innerHTML = 'Missing payment reference.'; return; }
  const r = await apiGet('/api/payments/' + encodeURIComponent(ref));
  if (!r.ok){ box.innerHTML = 'Payment not found.'; return; }
  const p = r.data.payment;
  const back = paymentReturnPage(p.kind);
  box.innerHTML = `
    <p class="price">${esc(money(p.amount, p.currency))}</p>
    <p style="color:#667">Test payment — no real card is charged.</p>
    ${p.status === 'paid'
      ? `<p>This payment is already complete.</p><a class="btn primary" href="${back}">Continue</a>`
      : `<button class="btn primary" id="pay-confirm">Pay now (TEST)</button>
         <a class="btn ghost" href="${back}" style="margin-left:10px">Cancel</a>`}`;
  const btn = document.getElementById('pay-confirm');
  if (btn) btn.addEventListener('click', async () => {
    btn.disabled = true;
    const c = await api(`/api/payments/${encodeURIComponent(ref)}/confirm`, {});
    if (!c.ok){ toast(c.data.error || 'Payment failed'); btn.disabled = false; return; }
    toast('Payment successful');
    location.href = back;
  });
}

/* --- Hotel search + booking (pages/hotels.html) --- */
function initHotels(){
  // Prefill sensible default dates (today+30 / +33) so the form is ready to use.
  const ci = document.getElementById('h-checkin');
  const co = document.getElementById('h-checkout');
  if (ci && !ci.value){ const d = new Date(Date.now() + 30 * 864e5); ci.value = d.toISOString().slice(0, 10); }
  if (co && !co.value){ const d = new Date(Date.now() + 33 * 864e5); co.value = d.toISOString().slice(0, 10); }
}
async function searchHotels(){
  const city = (document.getElementById('h-city') || {}).value || '';
  const checkIn = (document.getElementById('h-checkin') || {}).value || '';
  const checkOut = (document.getElementById('h-checkout') || {}).value || '';
  const guests = (document.getElementById('h-guests') || {}).value || '2';
  const wrap = document.getElementById('hotel-results');
  if (!wrap) return;
  if (!city || !checkIn || !checkOut){ toast('Enter a city and dates'); return; }
  wrap.innerHTML = '<div class="card pad">Searching…</div>';
  const q = `?city=${encodeURIComponent(city)}&checkIn=${checkIn}&checkOut=${checkOut}&guests=${encodeURIComponent(guests)}`;
  const r = await apiGet('/api/hotels/search' + q);
  if (!r.ok){ wrap.innerHTML = `<div class="card pad">${esc(r.data.error || 'Search failed')}</div>`; return; }
  const { hotels = [], nights } = r.data;
  if (!hotels.length){ wrap.innerHTML = '<div class="card pad">No hotels found.</div>'; return; }
  wrap.innerHTML = hotels.map(h => `
    <div class="card pad" style="margin-bottom:16px">
      <h3 style="margin:0">${esc(h.name)} ${'★'.repeat(h.rating || 0)}</h3>
      <p style="margin:4px 0;color:#667">${esc(h.city)} · ${nights} night(s)</p>
      ${h.rooms.map(room => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #eef;padding:10px 0;flex-wrap:wrap">
          <div><b>${esc(room.roomName)}</b><br><small style="color:#889">${esc(room.board)} · ${esc(money(room.nightlyPrice, room.currency))}/night</small></div>
          <div style="text-align:right"><div class="price">${esc(money(room.totalPrice, room.currency))}</div>
            <button class="btn primary" data-book-rate="${esc(room.rateKey)}" data-hotel="${esc(h.name)}">Book</button></div>
        </div>`).join('')}
    </div>`).join('');
}
async function bookHotelRate(rateKey, hotelName){
  if (!(await currentUser())){ location.href = 'login.html'; return; }
  const leadGuest = prompt(`Lead guest name for ${hotelName}:`);
  if (!leadGuest) return;
  let r;
  try { r = await api('/api/hotels/bookings', { rateKey, leadGuest }); }
  catch (e) { toast('Cannot reach the server.'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not create booking'); return; }
  const pay = await api(`/api/payments/hotel/${r.data.booking.id}/checkout`, {});
  if (!pay.ok){ toast(pay.data.error || 'Could not start payment'); return; }
  location.href = pay.data.redirectUrl;
}

/* --- My hotel bookings (pages/hotel-bookings.html) --- */
async function initHotelBookings(){
  if (!(await requireSession())) return;
  await renderHotelBookings();
}
async function renderHotelBookings(){
  const wrap = document.getElementById('hotel-booking-list');
  if (!wrap) return;
  const r = await apiGet('/api/hotels/bookings');
  if (!r.ok){ wrap.innerHTML = '<div class="card pad">Could not load your bookings.</div>'; return; }
  const bookings = r.data.bookings || [];
  if (!bookings.length){ wrap.innerHTML = '<div class="card pad">No hotel bookings yet. <a href="hotels.html">Search hotels</a>.</div>'; return; }
  wrap.innerHTML = bookings.map(b => `
    <div class="card pad" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h3 style="margin:0">${esc(b.hotelName)}</h3>
          <p style="margin:4px 0;color:#667">${esc(b.city)} · ${esc(b.roomName)} · ${esc(b.checkIn)} → ${esc(b.checkOut)} (${b.nights} night(s))</p>
          <p style="margin:4px 0;color:#667">Guest: ${esc(b.leadGuest)} · ${esc(money(b.amount, b.currency))}</p>
          ${b.voucherCode ? `<p style="margin:4px 0"><b>Voucher:</b> ${esc(b.voucherCode)}</p>` : ''}</div>
        <div>${statusBadge(b.status)}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${b.status === 'pending_payment' ? `<button class="btn primary" data-pay-hotel="${b.id}">Pay ${esc(money(b.amount, b.currency))}</button>` : ''}
        ${(b.status === 'pending_payment' || b.status === 'confirmed') ? `<button class="btn ghost" data-cancel-hotel="${b.id}">Cancel</button>` : ''}
      </div>
    </div>`).join('');
}
async function payHotelBooking(id){
  const r = await api(`/api/payments/hotel/${id}/checkout`, {});
  if (!r.ok){ toast(r.data.error || 'Could not start payment'); return; }
  location.href = r.data.redirectUrl;
}
async function cancelHotelBooking(id){
  if (!confirm('Cancel this booking?')) return;
  const r = await api(`/api/hotels/bookings/${id}/cancel`, {});
  if (!r.ok){ toast(r.data.error || 'Could not cancel'); return; }
  toast('Booking cancelled');
  renderHotelBookings();
}

/* --- Flight search + booking (pages/results.html) --- */
function initFlights(){
  const dd = document.getElementById('f-depart');
  if (dd && !dd.value){ const d = new Date(Date.now() + 30 * 864e5); dd.value = d.toISOString().slice(0, 10); }
}
async function searchFlights(){
  const origin = (document.getElementById('f-origin') || {}).value || '';
  const destination = (document.getElementById('f-destination') || {}).value || '';
  const departDate = (document.getElementById('f-depart') || {}).value || '';
  const adults = (document.getElementById('f-adults') || {}).value || '1';
  const wrap = document.getElementById('flight-results');
  if (!wrap) return;
  if (!origin || !destination || !departDate){ toast('Enter origin, destination and date'); return; }
  wrap.innerHTML = '<div class="card pad">Searching…</div>';
  const q = `?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&departDate=${departDate}&adults=${encodeURIComponent(adults)}`;
  const r = await apiGet('/api/flights/search' + q);
  if (!r.ok){ wrap.innerHTML = `<div class="card pad">${esc(r.data.error || 'Search failed')}</div>`; return; }
  const offers = r.data.offers || [];
  if (!offers.length){ wrap.innerHTML = '<div class="card pad">No flights found.</div>'; return; }
  wrap.innerHTML = offers.map((o, i) => `
    <div class="card pad" style="margin-bottom:14px">
      ${i === 0 ? '<div class="badge">Cheapest</div>' : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h3 style="margin:4px 0">${esc(o.airline)} · ${esc(o.flightNumber)}</h3>
          <p style="margin:2px 0;color:#667">${esc(o.origin)} ${esc(fmtDateTime(o.departAt))} → ${esc(o.destination)} ${esc(fmtDateTime(o.arriveAt))}</p>
          <p style="margin:2px 0;color:#889">${esc(o.cabin)} · ${o.stops === 0 ? 'Direct' : o.stops + ' stop(s)'} · ${o.passengers} traveller(s)</p></div>
        <div style="text-align:right"><div class="price">${esc(money(o.totalPrice, o.currency))}</div>
          <button class="btn primary" data-book-offer="${esc(o.offerKey)}" data-flight="${esc(o.airline + ' ' + o.flightNumber)}">Book</button></div>
      </div>
    </div>`).join('');
}
async function bookFlightOffer(offerKey, label){
  if (!(await currentUser())){ location.href = 'login.html'; return; }
  const leadPassenger = prompt(`Lead passenger name for ${label}:`);
  if (!leadPassenger) return;
  let r;
  try { r = await api('/api/flights/bookings', { offerKey, leadPassenger }); }
  catch (e) { toast('Cannot reach the server.'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not create booking'); return; }
  const pay = await api(`/api/payments/flight/${r.data.booking.id}/checkout`, {});
  if (!pay.ok){ toast(pay.data.error || 'Could not start payment'); return; }
  location.href = pay.data.redirectUrl;
}

/* --- My flight bookings (pages/flight-bookings.html) --- */
async function initFlightBookings(){
  if (!(await requireSession())) return;
  await renderFlightBookings();
}
async function renderFlightBookings(){
  const wrap = document.getElementById('flight-booking-list');
  if (!wrap) return;
  const r = await apiGet('/api/flights/bookings');
  if (!r.ok){ wrap.innerHTML = '<div class="card pad">Could not load your bookings.</div>'; return; }
  const bookings = r.data.bookings || [];
  if (!bookings.length){ wrap.innerHTML = '<div class="card pad">No flight bookings yet. <a href="results.html">Search flights</a>.</div>'; return; }
  wrap.innerHTML = bookings.map(b => `
    <div class="card pad" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h3 style="margin:0">${esc(b.airline)} · ${esc(b.flightNumber)}</h3>
          <p style="margin:4px 0;color:#667">${esc(b.origin)} ${esc(fmtDateTime(b.departAt))} → ${esc(b.destination)} ${esc(fmtDateTime(b.arriveAt))}</p>
          <p style="margin:4px 0;color:#667">${esc(b.leadPassenger)} · ${b.passengers} traveller(s) · ${esc(money(b.amount, b.currency))}</p>
          ${b.pnr ? `<p style="margin:4px 0">PNR <b>${esc(b.pnr)}</b>${b.ticketNumbers.length ? ' · Ticket(s): ' + esc(b.ticketNumbers.join(', ')) : ''}</p>` : ''}
          ${b.status === 'pending_payment' && b.ticketingDeadline ? `<p style="margin:4px 0;color:#a60"><b>Hold expires:</b> ${esc(fmtDateTime(b.ticketingDeadline))}</p>` : ''}</div>
        <div>${statusBadge(b.status)}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${b.status === 'pending_payment' ? `<button class="btn primary" data-pay-flight="${b.id}">Pay ${esc(money(b.amount, b.currency))}</button>` : ''}
        ${(b.status === 'pending_payment' || b.status === 'ticketed') ? `<button class="btn ghost" data-cancel-flight="${b.id}">Cancel</button>` : ''}
      </div>
    </div>`).join('');
}
async function payFlightBooking(id){
  const r = await api(`/api/payments/flight/${id}/checkout`, {});
  if (!r.ok){ toast(r.data.error || 'Could not start payment'); return; }
  location.href = r.data.redirectUrl;
}
async function cancelFlightBooking(id){
  if (!confirm('Cancel this booking?')) return;
  const r = await api(`/api/flights/bookings/${id}/cancel`, {});
  if (!r.ok){ toast(r.data.error || 'Could not cancel'); return; }
  toast('Booking cancelled');
  renderFlightBookings();
}

/* --- Tour search + booking (pages/tours.html) --- */
function initTours(){
  const dd = document.getElementById('t-date');
  if (dd && !dd.value){ const d = new Date(Date.now() + 14 * 864e5); dd.value = d.toISOString().slice(0, 10); }
}
// Keep the last search results so the Book button can read the chosen options.
let _tourResults = [];
async function searchTours(){
  const city = (document.getElementById('t-city') || {}).value || '';
  const date = (document.getElementById('t-date') || {}).value || '';
  const travellers = (document.getElementById('t-travellers') || {}).value || '1';
  const wrap = document.getElementById('tour-results');
  if (!wrap) return;
  if (!city || !date){ toast('Enter a city and date'); return; }
  wrap.innerHTML = '<div class="card pad">Searching…</div>';
  const q = `?city=${encodeURIComponent(city)}&date=${date}&travellers=${encodeURIComponent(travellers)}`;
  const r = await apiGet('/api/tours/search' + q);
  if (!r.ok){ wrap.innerHTML = `<div class="card pad">${esc(r.data.error || 'Search failed')}</div>`; return; }
  _tourResults = r.data.tours || [];
  if (!_tourResults.length){ wrap.innerHTML = '<div class="card pad">No tours found.</div>'; return; }
  const opt = (o) => `<option value="${esc(o.code)}">${esc(o.name)}${o.priceDelta ? ' (+' + esc(money(o.priceDelta, '')) + ')' : ''}</option>`;
  wrap.innerHTML = _tourResults.map((t, i) => `
    <div class="card pad" style="margin-bottom:16px">
      <h3 style="margin:0">${esc(t.name)}</h3>
      <p style="margin:4px 0;color:#667">${esc(t.city)} · ${t.durationHours}h · from ${esc(money(t.basePrice, t.currency))}/person</p>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="field"><label>Transfer</label><select id="transfer-${i}">${t.transferOptions.map(opt).join('')}</select></div>
        <div class="field"><label>Guide</label><select id="guide-${i}">${t.guideOptions.map(opt).join('')}</select></div>
      </div>
      <div style="margin-top:12px"><button class="btn primary" data-book-tour="${i}">Book</button></div>
    </div>`).join('');
}
async function bookTour(i){
  const t = _tourResults[i];
  if (!t) return;
  if (!(await currentUser())){ location.href = 'login.html'; return; }
  const travellers = (document.getElementById('t-travellers') || {}).value || '1';
  const transferCode = (document.getElementById('transfer-' + i) || {}).value;
  const guideCode = (document.getElementById('guide-' + i) || {}).value;
  const leadTraveller = prompt(`Lead traveller name for ${t.name}:`);
  if (!leadTraveller) return;
  let r;
  try { r = await api('/api/tours/bookings', { tourKey: t.tourKey, transferCode, guideCode, leadTraveller, travellers }); }
  catch (e) { toast('Cannot reach the server.'); return; }
  if (!r.ok){ toast(r.data.error || 'Could not create booking'); return; }
  const pay = await api(`/api/payments/tour/${r.data.booking.id}/checkout`, {});
  if (!pay.ok){ toast(pay.data.error || 'Could not start payment'); return; }
  location.href = pay.data.redirectUrl;
}

/* --- My tour bookings (pages/tour-bookings.html) --- */
async function initTourBookings(){
  if (!(await requireSession())) return;
  await renderTourBookings();
}
async function renderTourBookings(){
  const wrap = document.getElementById('tour-booking-list');
  if (!wrap) return;
  const r = await apiGet('/api/tours/bookings');
  if (!r.ok){ wrap.innerHTML = '<div class="card pad">Could not load your bookings.</div>'; return; }
  const bookings = r.data.bookings || [];
  if (!bookings.length){ wrap.innerHTML = '<div class="card pad">No tour bookings yet. <a href="tours.html">Search tours</a>.</div>'; return; }
  wrap.innerHTML = bookings.map(b => `
    <div class="card pad" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h3 style="margin:0">${esc(b.tourName)}</h3>
          <p style="margin:4px 0;color:#667">${esc(b.city)} · ${esc(b.date)} · ${b.travellers} traveller(s)</p>
          <p style="margin:4px 0;color:#667">Transfer: ${esc(b.transferOption)} · Guide: ${esc(b.guideOption)} · ${esc(money(b.amount, b.currency))}</p>
          <p style="margin:4px 0;color:#667">Lead: ${esc(b.leadTraveller)}</p>
          ${b.voucherCode ? `<p style="margin:4px 0"><b>Voucher:</b> ${esc(b.voucherCode)}</p>` : ''}</div>
        <div>${statusBadge(b.status)}</div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        ${b.status === 'pending_payment' ? `<button class="btn primary" data-pay-tour="${b.id}">Pay ${esc(money(b.amount, b.currency))}</button>` : ''}
        ${(b.status === 'pending_payment' || b.status === 'confirmed') ? `<button class="btn ghost" data-cancel-tour="${b.id}">Cancel</button>` : ''}
      </div>
    </div>`).join('');
}
async function payTourBooking(id){
  const r = await api(`/api/payments/tour/${id}/checkout`, {});
  if (!r.ok){ toast(r.data.error || 'Could not start payment'); return; }
  location.href = r.data.redirectUrl;
}
async function cancelTourBooking(id){
  if (!confirm('Cancel this booking?')) return;
  const r = await api(`/api/tours/bookings/${id}/cancel`, {});
  if (!r.ok){ toast(r.data.error || 'Could not cancel'); return; }
  toast('Booking cancelled');
  renderTourBookings();
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

/* Admin hotel bookings (read-only list in admin/index.html). */
async function initAdminHotels(){
  const wrap = document.getElementById('admin-hotel-bookings');
  if (!wrap) return;
  const u = await currentUser();
  if (!u || u.role !== 'admin'){ wrap.innerHTML = ''; return; }
  const r = await apiGet('/api/admin/hotel-bookings');
  if (!r.ok){ wrap.innerHTML = 'Could not load hotel bookings.'; return; }
  const rows = (r.data.bookings || []).map(b => `
    <tr>
      <td>#${b.id}</td>
      <td>${esc(b.leadGuest)}<br><small style="color:#889">${esc(b.customer.email || b.customer.mobile || '')}</small></td>
      <td>${esc(b.hotelName)}<br><small style="color:#889">${esc(b.city)}</small></td>
      <td>${esc(b.checkIn)} → ${esc(b.checkOut)}</td>
      <td>${esc(money(b.amount, b.currency))}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${esc(b.voucherCode || '—')}</td>
    </tr>`).join('');
  wrap.innerHTML = `<table class="table"><tr><th>Ref</th><th>Guest</th><th>Hotel</th><th>Dates</th><th>Amount</th><th>Status</th><th>Voucher</th></tr>${rows || '<tr><td colspan="7">No bookings yet.</td></tr>'}</table>`;
}

/* Admin flight bookings (read-only list in admin/index.html). */
async function initAdminFlights(){
  const wrap = document.getElementById('admin-flight-bookings');
  if (!wrap) return;
  const u = await currentUser();
  if (!u || u.role !== 'admin'){ wrap.innerHTML = ''; return; }
  const r = await apiGet('/api/admin/flight-bookings');
  if (!r.ok){ wrap.innerHTML = 'Could not load flight bookings.'; return; }
  const rows = (r.data.bookings || []).map(b => `
    <tr>
      <td>#${b.id}</td>
      <td>${esc(b.leadPassenger)}<br><small style="color:#889">${esc(b.customer.email || b.customer.mobile || '')}</small></td>
      <td>${esc(b.airline)} ${esc(b.flightNumber)}<br><small style="color:#889">${esc(b.origin)}→${esc(b.destination)}</small></td>
      <td>${esc(fmtDateTime(b.departAt))}</td>
      <td>${esc(money(b.amount, b.currency))}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${esc(b.pnr || '—')}<br><small style="color:#889">${esc(b.ticketNumbers.join(', ') || '')}</small></td>
    </tr>`).join('');
  wrap.innerHTML = `<table class="table"><tr><th>Ref</th><th>Passenger</th><th>Flight</th><th>Departs</th><th>Amount</th><th>Status</th><th>PNR / tickets</th></tr>${rows || '<tr><td colspan="7">No bookings yet.</td></tr>'}</table>`;
}

/* Admin tour bookings (read-only list in admin/index.html). */
async function initAdminTours(){
  const wrap = document.getElementById('admin-tour-bookings');
  if (!wrap) return;
  const u = await currentUser();
  if (!u || u.role !== 'admin'){ wrap.innerHTML = ''; return; }
  const r = await apiGet('/api/admin/tour-bookings');
  if (!r.ok){ wrap.innerHTML = 'Could not load tour bookings.'; return; }
  const rows = (r.data.bookings || []).map(b => `
    <tr>
      <td>#${b.id}</td>
      <td>${esc(b.leadTraveller)}<br><small style="color:#889">${esc(b.customer.email || b.customer.mobile || '')}</small></td>
      <td>${esc(b.tourName)}<br><small style="color:#889">${esc(b.city)} · ${esc(b.date)}</small></td>
      <td>${esc(b.transferOption)} / ${esc(b.guideOption)}</td>
      <td>${esc(money(b.amount, b.currency))}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${esc(b.voucherCode || '—')}</td>
    </tr>`).join('');
  wrap.innerHTML = `<table class="table"><tr><th>Ref</th><th>Traveller</th><th>Tour</th><th>Transfer / guide</th><th>Amount</th><th>Status</th><th>Voucher</th></tr>${rows || '<tr><td colspan="7">No bookings yet.</td></tr>'}</table>`;
}

/* Delegated clicks for the Phase 2/3 pages (buttons are injected dynamically). */
document.addEventListener('click', e => {
  const up = e.target.closest('[data-upload]'); if (up) uploadVisaDocs(up.dataset.upload);
  const pay = e.target.closest('[data-pay]'); if (pay) payVisa(pay.dataset.pay);
  const adm = e.target.closest('[data-admin-set]'); if (adm) adminSetStatus(adm.dataset.id, adm.dataset.adminSet);
  const bk = e.target.closest('[data-book-rate]'); if (bk) bookHotelRate(bk.dataset.bookRate, bk.dataset.hotel);
  const ph = e.target.closest('[data-pay-hotel]'); if (ph) payHotelBooking(ph.dataset.payHotel);
  const ch = e.target.closest('[data-cancel-hotel]'); if (ch) cancelHotelBooking(ch.dataset.cancelHotel);
  const bo = e.target.closest('[data-book-offer]'); if (bo) bookFlightOffer(bo.dataset.bookOffer, bo.dataset.flight);
  const pf = e.target.closest('[data-pay-flight]'); if (pf) payFlightBooking(pf.dataset.payFlight);
  const cf = e.target.closest('[data-cancel-flight]'); if (cf) cancelFlightBooking(cf.dataset.cancelFlight);
  const bt = e.target.closest('[data-book-tour]'); if (bt) bookTour(bt.dataset.bookTour);
  const pt = e.target.closest('[data-pay-tour]'); if (pt) payTourBooking(pt.dataset.payTour);
  const ct = e.target.closest('[data-cancel-tour]'); if (ct) cancelTourBooking(ct.dataset.cancelTour);
});

/* Page routing */
const path = location.pathname;
if (path.endsWith('/visas.html')) initVisaForm();
if (path.endsWith('/visa-status.html')) initVisaStatus();
if (path.endsWith('/pay.html')) initPay();
if (path.endsWith('/hotels.html')) initHotels();
if (path.endsWith('/hotel-bookings.html')) initHotelBookings();
if (path.endsWith('/results.html')) initFlights();
if (path.endsWith('/flight-bookings.html')) initFlightBookings();
if (path.endsWith('/tours.html')) initTours();
if (path.endsWith('/tour-bookings.html')) initTourBookings();
if (path.includes('/admin/')) { initAdminVisas(); initAdminHotels(); initAdminFlights(); initAdminTours(); }
