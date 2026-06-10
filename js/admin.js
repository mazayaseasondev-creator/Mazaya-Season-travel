/* Mazaya Admin Console — self-contained SPA for admin/index.html.
   Dark sidebar (recursive, multi-level nav) + hash-routed work area.
   Sections backed by the real API render live data; the rest are scaffolds. */
(() => {
'use strict';

/* ----------------------------- helpers ----------------------------- */
const $ = (s, r = document) => r.querySelector(s);
async function getJSON(path){
  const res = await fetch(path, { credentials: 'include' });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}
async function post(path, body){
  const res = await fetch(path, { method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}) });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}
async function patch(path, body){
  const res = await fetch(path, { method:'PATCH', credentials:'include',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(body || {}) });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}
async function del(path){
  const res = await fetch(path, { method:'DELETE', credentials:'include' });
  let data = {}; try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = (a, c) => (c || 'AED') + ' ' + Number(a || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
function fmtDate(iso){ if(!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}); }
function fmtDateTime(iso){ if(!iso) return '—'; const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(undefined,{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
const contact = c => esc((c && (c.email || c.mobile)) || '');
const nameOf = x => x == null ? '' : (typeof x === 'object' ? (x.name || x.email || '') : String(x));
function toast(msg){
  const t = document.createElement('div');
  t.textContent = msg;
  t.style = 'position:fixed;right:20px;bottom:20px;background:#102A57;color:#fff;padding:13px 18px;border-radius:12px;z-index:99;box-shadow:0 12px 40px #0004;font-weight:600';
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
const STATUS = {
  awaiting_payment:['warn','Awaiting payment'], pending_payment:['warn','Pending payment'],
  in_review:['warn','In review'], new:['warn','New'], hold:['warn','On hold'],
  paid:['ok','Paid'], confirmed:['ok','Confirmed'], ticketed:['ok','Ticketed'], approved:['ok','Approved'],
  cancelled:['bad','Cancelled'], rejected:['bad','Rejected'], refunded:['bad','Refunded'], failed:['bad','Failed'],
};
function badge(s){ const [cls,label] = STATUS[s] || ['info', s || '—']; return `<span class="badge ${cls}">${esc(label)}</span>`; }
function table(headers, rows, emptyMsg){
  if (!rows.length) return `<div class="empty">${esc(emptyMsg || 'Nothing here yet.')}</div>`;
  return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const panel = (title, body, actions='') =>
  `<div class="panel"><div class="panel-head"><h3>${esc(title)}</h3><div>${actions}</div></div><div class="panel-body">${body}</div></div>`;

/* ------------------------------ icons ------------------------------ */
const I = {
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  building:'<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  clipboard:'<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
  layers:'<path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
  bed:'<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v8"/><path d="M2 17h20"/><path d="M6 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  tag:'<path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.3"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  chart:'<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  pin:'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  languages:'<path d="M5 8h7M9 4v4M4.5 17 9 8l4.5 9M6.5 14h5"/><path d="M14 21l4-9 4 9M15.5 18h5"/>',
  terminal:'<path d="m4 17 6-6-6-6M12 19h8"/>',
  alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plane:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  server:'<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  dollar:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
};
const icon = (k, cls='ico') => `<span class="${cls}"><svg viewBox="0 0 24 24">${I[k]||I.grid}</svg></span>`;
const chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>';

/* ------------------------ scaffold view ------------------------ */
function scaffold(title, desc){
  return el => { el.innerHTML = `<div class="scaffold">${icon('layers')}
    <h2>${esc(title)}</h2><p>${esc(desc || 'This back-office module is part of the Mazaya platform. The interface is ready; connect it to data to go live.')}</p>
    <span class="tag">Planned module</span></div>`; };
}

/* =========================== real views =========================== */
async function viewDashboard(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [s, pay] = await Promise.all([getJSON('/api/admin/stats'), getJSON('/api/admin/payments')]);
  if (!s.ok){ el.innerHTML = '<div class="empty">Could not load dashboard.</div>'; return; }
  const d = s.data;
  const card = (label, value, ic, tone='') => `<div class="stat ${tone}"><div class="top"><span class="label">${label}</span>${icon(ic)}</div><div class="value">${value}</div></div>`;
  const stats = `<div class="stat-grid">
    ${card('Revenue', esc(money(d.revenue, d.currency)), 'dollar', 'green')}
    ${card('Total bookings', d.bookingsTotal, 'clipboard')}
    ${card('Customers', d.customers, 'users')}
    ${card('Open leads', d.openLeads, 'mail', 'amber')}
    ${card('Visa review queue', d.visaReviewQueue, 'file', 'amber')}
    ${card('Refunded', esc(money(d.refunded, d.currency)), 'tag', 'red')}
  </div>`;
  const counts = m => Object.values(m||{}).reduce((a,b)=>a+b,0);
  const breakdown = table(['Product','Bookings','Confirmed/Ticketed','Cancelled'], [
    ['<span class="pill Hotel">Hotels</span>', counts(d.hotelBookings), (d.hotelBookings.confirmed||0), (d.hotelBookings.cancelled||0)],
    ['<span class="pill Flight">Flights</span>', counts(d.flightBookings), (d.flightBookings.ticketed||0), (d.flightBookings.cancelled||0)],
    ['<span class="pill Tour">Tours</span>', counts(d.tourBookings), (d.tourBookings.confirmed||0), (d.tourBookings.cancelled||0)],
    ['<span class="pill Visa">Visas</span>', counts(d.visaRequests), (d.visaRequests.approved||0), (d.visaRequests.rejected||0)],
  ], 'No bookings yet.');
  const recent = (pay.ok ? pay.data.payments : []).slice(0,6).map(p => [
    `<small>${esc(p.ref)}</small>`, `<span class="pill ${cap(p.kind)}">${esc(cap(p.kind))}</span>`,
    contact(p.customer), esc(money(p.amount, p.currency)), badge(p.status),
  ]);
  el.innerHTML = stats + `<div class="grid-2">${panel('Bookings by product', breakdown)}${panel('Recent payments', table(['Ref','Type','Customer','Amount','Status'], recent, 'No payments yet.'))}</div>`;
}
const cap = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';

async function fetchAllOrders(){
  const [h,f,t,v] = await Promise.all([
    getJSON('/api/admin/hotel-bookings'), getJSON('/api/admin/flight-bookings'),
    getJSON('/api/admin/tour-bookings'), getJSON('/api/admin/visas'),
  ]);
  const out = [];
  (h.ok?h.data.bookings:[]).forEach(b=>out.push({type:'Hotel',ref:'H-'+b.id,who:nameOf(b.leadGuest),cust:b.customer,detail:`${b.hotelName} · ${b.city}`,amount:b.amount,currency:b.currency,status:b.status,date:b.checkIn}));
  (f.ok?f.data.bookings:[]).forEach(b=>out.push({type:'Flight',ref:'F-'+b.id,who:nameOf(b.leadPassenger),cust:b.customer,detail:`${b.airline} ${b.flightNumber} · ${b.origin}→${b.destination}`,amount:b.amount,currency:b.currency,status:b.status,date:b.departAt}));
  (t.ok?t.data.bookings:[]).forEach(b=>out.push({type:'Tour',ref:'T-'+b.id,who:nameOf(b.leadTraveller),cust:b.customer,detail:`${b.tourName} · ${b.city}`,amount:b.amount,currency:b.currency,status:b.status,date:b.date}));
  (v.ok?v.data.requests:[]).forEach(r=>out.push({type:'Visa',ref:'V-'+r.id,who:r.applicantName,cust:r.customer,detail:r.type.name,amount:r.type.price,currency:r.type.currency,status:r.status,date:r.createdAt}));
  out.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
  return out;
}
function ordersTable(list){
  return table(['Type','Ref','Customer','Details','Amount','Status'], list.map(o=>[
    `<span class="pill ${o.type}">${o.type}</span>`, `<small>${esc(o.ref)}</small>`,
    `${esc(o.who||'')}<br><small>${contact(o.cust)}</small>`, esc(o.detail),
    esc(money(o.amount, o.currency)), badge(o.status),
  ]), 'No orders yet.');
}
async function viewAllOrders(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  el.innerHTML = panel('All orders', ordersTable(await fetchAllOrders()));
}
async function viewHoldOrders(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const list = (await fetchAllOrders()).filter(o => ['pending_payment','awaiting_payment','hold'].includes(o.status));
  el.innerHTML = `<p class="muted-note">Orders that are held awaiting payment.</p>` + panel('Hold orders', ordersTable(list));
}
async function viewHotels(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/hotel-bookings');
  const rows = (r.ok?r.data.bookings:[]).map(b=>[
    `<small>H-${b.id}</small>`, `${esc(nameOf(b.leadGuest))}<br><small>${contact(b.customer)}</small>`,
    `${esc(b.hotelName)}<br><small>${esc(b.city)}</small>`, `${esc(b.checkIn)} → ${esc(b.checkOut)}`,
    esc(money(b.amount,b.currency)), badge(b.status), esc(b.voucherCode||'—'),
  ]);
  el.innerHTML = panel('Hotel bookings', table(['Ref','Guest','Hotel','Dates','Amount','Status','Voucher'], rows, 'No hotel bookings yet.'));
}
async function viewFlights(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/flight-bookings');
  const rows = (r.ok?r.data.bookings:[]).map(b=>[
    `<small>F-${b.id}</small>`, `${esc(nameOf(b.leadPassenger))}<br><small>${contact(b.customer)}</small>`,
    `${esc(b.airline)} ${esc(b.flightNumber)}<br><small>${esc(b.origin)}→${esc(b.destination)}</small>`,
    esc(fmtDateTime(b.departAt)), esc(money(b.amount,b.currency)), badge(b.status),
    `${esc(b.pnr||'—')}<br><small>${esc((b.ticketNumbers||[]).join(', '))}</small>`,
  ]);
  el.innerHTML = panel('Flight bookings', table(['Ref','Passenger','Flight','Departs','Amount','Status','PNR / tickets'], rows, 'No flight bookings yet.'));
}
async function viewTours(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/tour-bookings');
  const rows = (r.ok?r.data.bookings:[]).map(b=>[
    `<small>T-${b.id}</small>`, `${esc(nameOf(b.leadTraveller))}<br><small>${contact(b.customer)}</small>`,
    `${esc(b.tourName)}<br><small>${esc(b.city)} · ${esc(b.date)}</small>`,
    `${esc(b.transferOption)} / ${esc(b.guideOption)}`, esc(money(b.amount,b.currency)), badge(b.status), esc(b.voucherCode||'—'),
  ]);
  el.innerHTML = panel('Tour bookings', table(['Ref','Traveller','Tour','Transfer / guide','Amount','Status','Voucher'], rows, 'No tour bookings yet.'));
}
async function viewVisas(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/visas');
  const rows = (r.ok?r.data.requests:[]).map(req=>[
    `<small>V-${req.id}</small>`, `${esc(req.applicantName)}<br><small>${contact(req.customer)}</small>`,
    esc(req.type.name), `${esc(money(req.type.price,req.type.currency))}<br><small>${esc(req.payment?req.payment.status:'unpaid')}</small>`,
    badge(req.status),
    `<button class="btn sm" data-visa="${req.id}" data-status="in_review">Review</button> `+
    `<button class="btn sm primary" data-visa="${req.id}" data-status="approved">Approve</button> `+
    `<button class="btn sm danger" data-visa="${req.id}" data-status="rejected">Reject</button>`,
  ]);
  el.innerHTML = panel('Visa requests', table(['Ref','Applicant','Visa','Price / payment','Status','Action'], rows, 'No visa requests yet.'));
}
async function viewPayments(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/payments');
  const rows = (r.ok?r.data.payments:[]).map(p=>[
    `<small>${esc(p.ref)}</small>`, `<span class="pill ${cap(p.kind)}">${esc(cap(p.kind))}</span>`,
    contact(p.customer), esc(money(p.amount,p.currency)), esc(fmtDate(p.createdAt)), badge(p.status),
    p.status==='paid' ? `<button class="btn sm danger" data-refund="${esc(p.ref)}">Refund</button>` : '',
  ]);
  el.innerHTML = panel('Payment logs', table(['Ref','Type','Customer','Amount','Date','Status','Action'], rows, 'No payments yet.'));
}
async function viewRefunds(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/payments?status=refunded');
  const rows = (r.ok?r.data.payments:[]).map(p=>[
    `<small>${esc(p.ref)}</small>`, `<span class="pill ${cap(p.kind)}">${esc(cap(p.kind))}</span>`,
    contact(p.customer), esc(money(p.amount,p.currency)), esc(fmtDate(p.updatedAt||p.createdAt)), badge(p.status),
  ]);
  el.innerHTML = panel('Refunds', table(['Ref','Type','Customer','Amount','Refunded','Status'], rows, 'No refunds yet.'));
}
async function viewInvoices(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [man, pay] = await Promise.all([getJSON('/api/admin/invoices'), getJSON('/api/admin/payments?status=paid')]);
  const list = [];
  (man.ok?man.data.invoices:[]).forEach(i=>list.push({ number:i.number, who:i.contact, for:i.description,
    amount:i.amount, currency:i.currency, date:i.createdAt, status:i.status, source:'Manual' }));
  (pay.ok?pay.data.payments:[]).forEach((p,i)=>list.push({ number:'INV-'+(1000+i), who:(p.customer&&(p.customer.email||p.customer.mobile))||'',
    for:cap(p.kind)+' booking', amount:p.amount, currency:p.currency, date:p.createdAt, status:'paid', source:'Sale' }));
  list.sort((a,b)=> new Date(b.date||0) - new Date(a.date||0));
  const rows = list.map(i=>[
    `<b>${esc(i.number)}</b>`, esc(i.who), esc(i.for), esc(money(i.amount,i.currency)),
    esc(fmtDate(i.date)), badge(i.status), `<span class="pill">${esc(i.source)}</span>`,
  ]);
  el.innerHTML = `<div class="section-head"><p class="muted-note" style="margin:0">Manual invoices plus sales invoices from captured payments.</p>`
    + `<button class="btn primary sm" data-goto="inv-create">+ Create invoice</button></div>`
    + panel('All invoices', table(['Invoice','Customer','For','Amount','Issued','Status','Source'], rows, 'No invoices yet.'));
}
function viewCreateInvoice(el){
  el.innerHTML = panel('Create invoice', `
    <p class="muted-note">Raise a manual invoice for a customer or agency. It appears in All Invoices.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:640px;padding:6px 0">
      <label style="font-size:12px;font-weight:600">Customer email / mobile<br>
        <input id="ci-contact" placeholder="customer@example.com" style="margin-top:5px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600">Amount (AED)<br>
        <input id="ci-amount" type="number" min="1" step="0.01" placeholder="1500" style="margin-top:5px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600;grid-column:1/3">Description<br>
        <input id="ci-desc" placeholder="Tailor-made package — 4 nights Dubai" style="margin-top:5px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px"></label>
    </div>
    <button class="btn primary" id="ci-create">Create invoice</button>`);
}
async function viewCustomers(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/customers');
  const rows = (r.ok?r.data.customers:[]).map(c=>[
    `#${c.id}`, esc(c.name||'—'), contact(c), c.paidCount, esc(money(c.spend,'AED')), c.miles, esc(fmtDate(c.createdAt)),
  ]);
  el.innerHTML = panel('Customers', table(['ID','Name','Contact','Paid orders','Lifetime spend','Miles','Joined'], rows, 'No customers yet.'));
}
async function viewLeads(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/leads');
  const rows = (r.ok?r.data.leads:[]).map(l=>[
    `#${l.id}`, esc(l.name), esc(l.email||l.mobile||''), esc(l.message), esc(fmtDate(l.createdAt)), badge(l.status),
  ]);
  el.innerHTML = panel('Messages & leads', table(['ID','Name','Contact','Message','Received','Status'], rows, 'No messages yet.'));
}
const card2 = (label, value) => `<div class="stat"><div class="top"><span class="label">${label}</span></div><div class="value">${value}</div></div>`;
function barChart(rows){ // rows: [label, value, displayValue]
  const max = Math.max(1, ...rows.map(r=>r[1]));
  return rows.map(([label,n,disp])=>`<div style="margin:11px 0">
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span>${esc(label)}</span><span>${esc(disp!=null?disp:n)}</span></div>
    <div style="background:#eef3fb;border-radius:8px;height:12px;margin-top:5px;overflow:hidden">
      <div style="height:100%;width:${Math.round(n/max*100)}%;background:var(--blue)"></div></div></div>`).join('');
}
async function viewReports(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [s, payR] = await Promise.all([getJSON('/api/admin/stats'), getJSON('/api/admin/payments')]);
  if (!s.ok){ el.innerHTML = '<div class="empty">Could not load reports.</div>'; return; }
  const d = s.data;
  const pays = payR.ok ? payR.data.payments : [];
  const paid = pays.filter(p=>p.status==='paid');
  // revenue by month
  const byMonth = {};
  paid.forEach(p=>{ const m = (p.createdAt||'').slice(0,7); byMonth[m]=(byMonth[m]||0)+Number(p.amount||0); });
  const months = Object.keys(byMonth).sort();
  const monthRows = months.map(m=>[m, byMonth[m], money(byMonth[m],'AED')]);
  // revenue by product
  const byKind = {};
  paid.forEach(p=>{ byKind[p.kind]=(byKind[p.kind]||0)+Number(p.amount||0); });
  const prodRows = Object.entries(byKind).map(([k,v])=>[cap(k), v, money(v,'AED')]);
  // top customers
  const byCust = {};
  paid.forEach(p=>{ const who=(p.customer&&(p.customer.email||p.customer.mobile))||'—'; byCust[who]=(byCust[who]||0)+Number(p.amount||0); });
  const top = Object.entries(byCust).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([who,v])=>[esc(who), esc(money(v,'AED'))]);
  el.innerHTML = `<div class="stat-grid">
      ${card2('Gross revenue', esc(money(d.revenue,d.currency)))}
      ${card2('Refunded', esc(money(d.refunded,d.currency)))}
      ${card2('Net revenue', esc(money((d.revenue||0)-(d.refunded||0),d.currency)))}
      ${card2('Paid orders', paid.length)}
    </div>
    <div class="grid-2">
      ${panel('Revenue by month', monthRows.length?barChart(monthRows):'<div class="empty">No revenue yet.</div>')}
      ${panel('Revenue by product', prodRows.length?barChart(prodRows):'<div class="empty">No revenue yet.</div>')}
    </div>
    ${panel('Top customers', table(['Customer','Spend'], top, 'No paid orders yet.'))}`;
}
async function viewSuppliers(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/payments');
  const pays = (r.ok?r.data.payments:[]).filter(p=>p.status==='paid');
  const SUP = { hotel:'Hotelbeds', flight:'Amadeus', tour:'Viator', visa:'In-house' };
  const agg = {};
  pays.forEach(p=>{ const s=SUP[p.kind]||'Other'; (agg[s]=agg[s]||{n:0,rev:0}); agg[s].n++; agg[s].rev+=Number(p.amount||0); });
  const rows = Object.entries(agg).map(([s,v])=>[esc(s), v.n, esc(money(v.rev,'AED'))]);
  el.innerHTML = `<p class="muted-note">Bookings and revenue settled with each supplier.</p>`
    + panel('Suppliers report', table(['Supplier','Paid bookings','Revenue'], rows, 'No supplier activity yet.'));
}
function emptyReport(title, desc){
  return el => { el.innerHTML = `<p class="muted-note">${esc(desc)}</p>`
    + panel(title, `<div class="empty">No ${esc(title.toLowerCase())} data yet — this report populates once B2B agencies and agents are trading.</div>`); };
}
async function viewUsers(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const [me, cust] = await Promise.all([getJSON('/api/auth/me'), getJSON('/api/admin/customers')]);
  const u = me.ok ? me.data.user : null;
  const adminCard = u ? `<p class="muted-note">You are signed in as an administrator. Grant admin to others by adding their email/mobile to <code>ADMIN_IDENTIFIERS</code>.</p>
    <table class="table"><tbody><tr><td><b>${esc(u.name||u.email||u.mobile)}</b></td><td>${contact(u)}</td><td><span class="badge ok">Admin</span></td></tr></tbody></table>` : '';
  const rows = (cust.ok?cust.data.customers:[]).map(c=>[`#${c.id}`, esc(c.name||'—'), contact(c), `<span class="badge info">Customer</span>`]);
  el.innerHTML = panel('Administrators', adminCard) + panel('Users', table(['ID','Name','Contact','Role'], rows, 'No users yet.'));
}
function viewGateways(el){
  const rows = [
    ['N-Genius (Network International)','Payments','<span class="badge warn">Simulated (dev)</span>','PAYMENT_PROVIDER'],
  ];
  el.innerHTML = `<p class="muted-note">Configured payment gateways. Set <code>PAYMENT_PROVIDER=ngenius</code> with credentials for live charging.</p>`
    + panel('Payment gateways', table(['Gateway','Type','Status','Env var'], rows));
}
function viewGds(el){
  const rows = [
    ['Amadeus','Flights (GDS)','<span class="badge warn">Simulated (dev)</span>','FLIGHT_SUPPLIER'],
    ['Hotelbeds','Hotels (bedbank)','<span class="badge warn">Simulated (dev)</span>','HOTEL_SUPPLIER'],
    ['Viator','Tours','<span class="badge warn">Simulated (dev)</span>','TOUR_SUPPLIER'],
    ['N-Genius','Payments','<span class="badge warn">Simulated (dev)</span>','PAYMENT_PROVIDER'],
  ];
  el.innerHTML = `<p class="muted-note">Supplier & GDS integrations. Each runs on the built-in simulator until real credentials are configured via environment variables.</p>`
    + panel('Integrations', table(['Provider','Product','Status','Env var'], rows));
}
function viewCurrencies(el){
  el.innerHTML = `<p class="muted-note">Currencies used for pricing and settlement.</p>`
    + panel('Currencies', table(['Code','Name','Role'], [['AED','UAE Dirham','<span class="badge ok">Base</span>']]));
}

/* ----------------------- Accounting (from the ledger) ----------------------- */
// All accounting views derive from the captured/refunded payments ledger.
async function ledger(){ const r = await getJSON('/api/admin/payments'); return r.ok ? r.data.payments : []; }
const revAccount = k => ({hotel:'4000 · Hotel revenue',flight:'4100 · Flight revenue',tour:'4200 · Tour revenue',visa:'4300 · Visa revenue'}[k] || '4900 · Other revenue');

async function viewReceipts(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const paid = (await ledger()).filter(p => p.status === 'paid');
  const rows = paid.map((p,i)=>[`<b>RCT-${1000+i}</b>`, `<small>${esc(p.ref)}</small>`, contact(p.customer),
    `<span class="pill ${cap(p.kind)}">${esc(cap(p.kind))}</span>`, esc(money(p.amount,p.currency)), esc(fmtDate(p.createdAt))]);
  el.innerHTML = `<p class="muted-note">Every captured payment is a receipt.</p>`
    + panel('Receipts', table(['Receipt','Payment ref','Customer','For','Amount','Date'], rows, 'No receipts yet.'));
}
async function viewCreditNotes(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const refunded = (await ledger()).filter(p => p.status === 'refunded');
  const rows = refunded.map((p,i)=>[`<b>CN-${500+i}</b>`, `<small>${esc(p.ref)}</small>`, contact(p.customer),
    `<span class="pill ${cap(p.kind)}">${esc(cap(p.kind))}</span>`, esc(money(p.amount,p.currency)), esc(fmtDate(p.updatedAt||p.createdAt))]);
  el.innerHTML = `<p class="muted-note">Refunds are issued as credit notes.</p>`
    + panel('Credit notes', table(['Credit note','Payment ref','Customer','For','Amount','Date'], rows, 'No credit notes yet.'));
}
async function viewJournal(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const all = await ledger();
  const lines = [];
  all.forEach(p=>{
    if (p.status === 'paid'){
      lines.push([esc(fmtDate(p.createdAt)), '1000 · Cash', esc(money(p.amount,p.currency)), '', `Receipt ${esc(p.ref)}`]);
      lines.push([esc(fmtDate(p.createdAt)), revAccount(p.kind), '', esc(money(p.amount,p.currency)), `Receipt ${esc(p.ref)}`]);
    } else if (p.status === 'refunded'){
      lines.push([esc(fmtDate(p.updatedAt||p.createdAt)), revAccount(p.kind), esc(money(p.amount,p.currency)), '', `Refund ${esc(p.ref)}`]);
      lines.push([esc(fmtDate(p.updatedAt||p.createdAt)), '1000 · Cash', '', esc(money(p.amount,p.currency)), `Refund ${esc(p.ref)}`]);
    }
  });
  el.innerHTML = `<p class="muted-note">Double-entry journal generated from the payment ledger.</p>`
    + panel('Journal', table(['Date','Account','Debit','Credit','Memo'], lines, 'No journal entries yet.'));
}
async function viewBalance(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const all = await ledger();
  const paid = all.filter(p=>p.status==='paid'), ref = all.filter(p=>p.status==='refunded');
  const sum = a => a.reduce((s,p)=>s+Number(p.amount||0),0);
  const byKind = {};
  paid.forEach(p=>{ byKind[p.kind]=(byKind[p.kind]||0)+Number(p.amount||0); });
  const cash = sum(paid)-sum(ref);
  const rows = Object.entries(byKind).map(([k,v])=>[revAccount(k), '', esc(money(v,'AED'))])
    .concat([['1000 · Cash', esc(money(cash,'AED')), ''], ['4xxx · Refunds (contra)', esc(money(sum(ref),'AED')), '']]);
  const card = (label, value) => `<div class="stat"><div class="top"><span class="label">${label}</span></div><div class="value">${value}</div></div>`;
  el.innerHTML = `<div class="stat-grid">
      ${card('Total receipts', esc(money(sum(paid),'AED')))}
      ${card('Total refunds', esc(money(sum(ref),'AED')))}
      ${card('Cash balance', esc(money(cash,'AED')))}
      ${card('Entries', all.length)}
    </div>` + panel('Balance report', table(['Account','Debit','Credit'], rows, 'No balances yet.'));
}
async function viewStatement(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const all = await ledger();
  const byCust = {};
  all.forEach(p=>{ const key = (p.customer && (p.customer.email||p.customer.mobile)) || ('#'+(p.customer&&p.customer.id));
    (byCust[key] = byCust[key] || []).push(p); });
  const blocks = Object.entries(byCust).map(([who, list])=>{
    const rows = list.map(p=>[esc(fmtDate(p.createdAt)), `<small>${esc(p.ref)}</small>`,
      p.status==='paid'?'Invoice':'Credit note', p.status==='paid'?esc(money(p.amount,p.currency)):'',
      p.status==='refunded'?esc(money(p.amount,p.currency)):'', badge(p.status)]);
    return panel(who, table(['Date','Ref','Type','Charge','Credit','Status'], rows));
  });
  el.innerHTML = (blocks.join('') || '<div class="empty">No account activity yet.</div>');
}
function viewAccounts(el){
  const rows = [
    ['1000','Cash / Bank','Asset'],['1100','Accounts receivable','Asset'],
    ['2000','Supplier payables','Liability'],
    ['4000','Hotel revenue','Revenue'],['4100','Flight revenue','Revenue'],
    ['4200','Tour revenue','Revenue'],['4300','Visa revenue','Revenue'],
  ].map(r=>[`<b>${r[0]}</b>`, esc(r[1]), `<span class="badge info">${r[2]}</span>`]);
  el.innerHTML = `<p class="muted-note">Chart of accounts.</p>` + panel('Accounts', table(['Code','Account','Type'], rows));
}

/* ------------------------------ Pricing ------------------------------ */
async function pricerView(el, product, label){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/pricing');
  const current = r.ok ? (r.data.markups[product] || 0) : 0;
  el.innerHTML = `<p class="muted-note">Set the markup added to every ${esc(label)} price at search time. Customers are quoted and charged the marked-up price.</p>`
    + panel(`${label} markup`, `
      <div style="display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;padding:6px 0">
        <label style="font-weight:600;font-size:13px">Markup %
          <div style="margin-top:6px"><input id="mk-input" type="number" min="0" max="500" step="0.5" value="${current}"
            style="width:140px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:15px;font-weight:700"></div>
        </label>
        <button class="btn primary" data-save-markup="${product}">Save markup</button>
        <span id="mk-status" class="muted-note" style="margin:0"></span>
      </div>
      <p class="muted-note">Current: <b>${current}%</b></p>`);
}
const viewFlightPricer = el => pricerView(el, 'flight', 'Flight');
const viewHotelsPricer = el => pricerView(el, 'hotel', 'Hotel');
async function viewVouchers(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/vouchers');
  const rows = (r.ok?r.data.vouchers:[]).map(v=>[
    `<b>${esc(v.code)}</b>`, v.kind==='percent'?`${v.value}%`:esc(money(v.value,'AED')),
    v.active?'<span class="badge ok">Active</span>':'<span class="badge bad">Inactive</span>',
    v.expiresOn?esc(fmtDate(v.expiresOn)):'—', `${v.usedCount}${v.maxUses?(' / '+v.maxUses):''}`,
    `<button class="btn sm" data-voucher-toggle="${v.id}" data-active="${v.active?'0':'1'}">${v.active?'Deactivate':'Activate'}</button>`,
  ]);
  const form = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:6px 0">
      <label style="font-size:12px;font-weight:600">Code<br><input id="v-code" placeholder="SUMMER10" style="margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:9px;text-transform:uppercase"></label>
      <label style="font-size:12px;font-weight:600">Type<br><select id="v-kind" style="margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:9px"><option value="percent">Percent %</option><option value="fixed">Fixed AED</option></select></label>
      <label style="font-size:12px;font-weight:600">Value<br><input id="v-value" type="number" min="1" step="1" placeholder="10" style="margin-top:5px;width:110px;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <button class="btn primary" id="v-create">Create voucher</button>
    </div>`;
  el.innerHTML = panel('New voucher', form) + panel('Vouchers', table(['Code','Discount','Status','Expires','Used','Action'], rows, 'No vouchers yet.'));
}
async function viewTestTool(el){
  el.innerHTML = panel('Pricing test tool', `
    <p class="muted-note">Run a live hotel search and see the quoted price (with any markup applied).</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;padding:6px 0">
      <label style="font-size:12px;font-weight:600">City<br><input id="tt-city" value="Dubai" style="margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600">Check-in<br><input id="tt-in" type="date" value="2026-09-01" style="margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600">Check-out<br><input id="tt-out" type="date" value="2026-09-03" style="margin-top:5px;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <button class="btn primary" id="tt-run">Run search</button>
    </div><div id="tt-result"></div>`);
}

/* ------------------------ Company Settings ------------------------ */
function field(setting, label, value, type='text'){
  return `<label style="font-size:12px;font-weight:600">${esc(label)}<br>
    <input data-setting="${setting}" type="${type}" value="${esc(value||'')}"
      style="margin-top:5px;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px"></label>`;
}
async function viewCompanyInfo(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/settings');
  const s = r.ok ? r.data.settings : {};
  el.innerHTML = panel('Company info', `
    <p class="muted-note">Legal and contact details for your agency. Used on invoices and the storefront.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:760px;padding:6px 0">
      ${field('company.legalName','Legal name', s['company.legalName'])}
      ${field('company.tradingName','Trading name', s['company.tradingName'])}
      ${field('company.licenseNo','Trade licence no.', s['company.licenseNo'])}
      ${field('company.trn','Tax / TRN no.', s['company.trn'])}
      ${field('company.email','Email', s['company.email'])}
      ${field('company.phone','Phone', s['company.phone'])}
      ${field('company.website','Website', s['company.website'])}
      ${field('company.currency','Base currency', s['company.currency'])}
      ${field('company.address','Address', s['company.address'])}
      ${field('company.city','City', s['company.city'])}
      ${field('company.country','Country', s['company.country'])}
    </div>
    <button class="btn primary" data-save-settings>Save company info</button>`);
}
async function viewLookFeel(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/settings');
  const s = r.ok ? r.data.settings : {};
  const primary = s['brand.primaryColor'] || '#1B4087';
  const accent = s['brand.accentColor'] || '#FFC831';
  el.innerHTML = panel('Look & feel', `
    <p class="muted-note">Brand identity used across the storefront and documents.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:760px;padding:6px 0">
      ${field('brand.primaryColor','Primary colour', primary, 'color')}
      ${field('brand.accentColor','Accent colour', accent, 'color')}
      ${field('brand.logoUrl','Logo URL', s['brand.logoUrl'])}
      ${field('brand.tagline','Tagline', s['brand.tagline'])}
    </div>
    <div style="margin:10px 0 16px;border:1px solid var(--line);border-radius:12px;overflow:hidden;max-width:760px">
      <div style="background:${esc(primary)};color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between">
        <b>${esc(s['company.tradingName']||'Mazaya')}</b>
        <span style="background:${esc(accent)};color:#3a2a00;padding:6px 12px;border-radius:999px;font-weight:800;font-size:12px">Book now</span>
      </div>
      <div style="padding:14px 20px;color:var(--muted);font-size:13px">${esc(s['brand.tagline']||'')}</div>
    </div>
    <button class="btn primary" data-save-settings>Save look &amp; feel</button>`);
}

/* ------------------------- Notifications ------------------------- */
async function viewNotifications(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/notifications');
  const rows = (r.ok?r.data.notifications:[]).map(n=>[
    `<span class="badge ${n.channel==='email'?'info':n.channel==='sms'?'ok':''}">${esc(n.channel)}</span>`,
    esc(n.recipient||'—'), `${esc(n.subject)}<br><small>${esc((n.body||'').slice(0,80))}</small>`,
    badge(n.status), esc(fmtDateTime(n.createdAt)),
  ]);
  const compose = `<div style="display:grid;grid-template-columns:160px 1fr;gap:12px;max-width:720px;padding:6px 0">
      <label style="font-size:12px;font-weight:600">Channel<br>
        <select id="nt-channel" style="margin-top:5px;width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px"><option value="email">Email</option><option value="sms">SMS</option></select></label>
      <label style="font-size:12px;font-weight:600">Recipient<br>
        <input id="nt-to" placeholder="customer@example.com / 05XXXXXXXX" style="margin-top:5px;width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600;grid-column:1/3">Subject<br>
        <input id="nt-subject" placeholder="Your booking is confirmed" style="margin-top:5px;width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></label>
      <label style="font-size:12px;font-weight:600;grid-column:1/3">Message<br>
        <textarea id="nt-body" rows="3" placeholder="Message body…" style="margin-top:5px;width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit"></textarea></label>
    </div><button class="btn primary" id="nt-send">Send notification</button>
    <p class="muted-note">In dev, messages are logged (not delivered) until an SMS/email provider is connected — the same model as OTP.</p>`;
  el.innerHTML = panel('Compose', compose) + panel('Notification log', table(['Channel','Recipient','Subject','Status','Sent'], rows, 'No notifications yet.'));
}

/* ===================== generic content collections ===================== */
function cInput(f, val=''){
  const base = 'margin-top:5px;width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-size:14px';
  if (f.type==='textarea') return `<textarea data-cfield="${f.key}" rows="2" placeholder="${esc(f.label)}" style="${base};font-family:inherit">${esc(val)}</textarea>`;
  if (f.type==='select') return `<select data-cfield="${f.key}" style="${base}">${(f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
  const t = f.type==='number'?'number':f.type==='color'?'color':f.type==='date'?'date':'text';
  return `<input data-cfield="${f.key}" type="${t}" value="${esc(val)}" placeholder="${esc(f.label)}" style="${base}">`;
}
const block = (title, label) => ({ title, addLabel:label,
  fields:[{key:'title',label:'Title'},{key:'subtitle',label:'Subtitle'},{key:'imageUrl',label:'Image URL'},{key:'link',label:'Link'}], cols:['title','subtitle'] });
const SCHEMAS = {
  'faqs': { title:'FAQs', addLabel:'FAQ', desc:'Questions shown on the public help page.',
    fields:[{key:'question',label:'Question'},{key:'answer',label:'Answer',type:'textarea'}], cols:['question','answer'] },
  'static-pages': { title:'Static pages', addLabel:'page', desc:'CMS pages (about, terms, privacy…).',
    fields:[{key:'slug',label:'Slug'},{key:'title',label:'Title'},{key:'body',label:'Body',type:'textarea'}], cols:['slug','title'] },
  'block-sliders': block('Home sliders','slide'),
  'block-pillars': { title:'Main pillars', addLabel:'pillar', fields:[{key:'title',label:'Title'},{key:'subtitle',label:'Subtitle'},{key:'icon',label:'Icon'}], cols:['title','subtitle'] },
  'block-offers': block('Offers','offer'),
  'block-testimonials': { title:'Customer testimonials', addLabel:'testimonial', fields:[{key:'name',label:'Name'},{key:'quote',label:'Quote',type:'textarea'},{key:'rating',label:'Rating',type:'number'}], cols:['name','quote'] },
  'block-partners': { title:'Partner logos', addLabel:'partner', fields:[{key:'name',label:'Name'},{key:'logoUrl',label:'Logo URL'}], cols:['name','logoUrl'] },
  'block-register': { title:'Register pillars', addLabel:'pillar', fields:[{key:'title',label:'Title'},{key:'subtitle',label:'Subtitle'}], cols:['title','subtitle'] },
  'block-banners': { title:'Product banners', addLabel:'banner', fields:[{key:'title',label:'Title'},{key:'imageUrl',label:'Image URL'},{key:'link',label:'Link'}], cols:['title','link'] },
  'pkg-countries': { title:'Countries', addLabel:'country', fields:[{key:'name',label:'Name'},{key:'code',label:'ISO code'}], cols:['name','code'] },
  'pkg-zones': { title:'Zones', addLabel:'zone', fields:[{key:'name',label:'Name'},{key:'country',label:'Country'}], cols:['name','country'] },
  'pkg-programs': { title:'Programs', addLabel:'program', fields:[{key:'name',label:'Name'},{key:'country',label:'Country'},{key:'nights',label:'Nights',type:'number'},{key:'price',label:'Price (AED)',type:'number'}], cols:['name','country','nights','price'] },
  'pkg-activities': { title:'Activities', addLabel:'activity', fields:[{key:'name',label:'Name'},{key:'city',label:'City'},{key:'price',label:'Price (AED)',type:'number'}], cols:['name','city','price'] },
  'hotel-list': { title:'Hotels', addLabel:'hotel', fields:[{key:'name',label:'Name'},{key:'city',label:'City'},{key:'rating',label:'Stars',type:'number'}], cols:['name','city','rating'] },
  'hotel-facts-group': { title:'Facts groups', addLabel:'group', fields:[{key:'name',label:'Name'}], cols:['name'] },
  'hotel-facts': { title:'Facts', addLabel:'fact', fields:[{key:'name',label:'Name'},{key:'group',label:'Group'}], cols:['name','group'] },
  'hotel-suppliers': { title:'Hotel suppliers', addLabel:'supplier', fields:[{key:'name',label:'Name'},{key:'type',label:'Type',type:'select',options:['Bedbank','Direct contract','Channel manager']}], cols:['name','type'] },
  'hotel-room-translations': { title:'Room translations', addLabel:'translation', fields:[{key:'roomCode',label:'Room code'},{key:'en',label:'English'},{key:'ar',label:'Arabic'}], cols:['roomCode','en','ar'] },
  'ancillary-products': { title:'Ancillary products', addLabel:'product', fields:[{key:'name',label:'Name'},{key:'type',label:'Type',type:'select',options:['Baggage','Seat','Insurance','Transfer','Meal']},{key:'price',label:'Price (AED)',type:'number'}], cols:['name','type','price'] },
  'ancillary-displays': { title:'Ancillary displays', addLabel:'display', fields:[{key:'name',label:'Name'},{key:'placement',label:'Placement',type:'select',options:['Checkout','Search results','Booking page']}], cols:['name','placement'] },
  'b2b-agencies': { title:'B2B agencies', addLabel:'agency', desc:'Sub-agents who book on credit.', fields:[{key:'name',label:'Agency name'},{key:'contact',label:'Contact'},{key:'creditLimit',label:'Credit limit (AED)',type:'number'},{key:'markup',label:'Markup %',type:'number'}], cols:['name','contact','creditLimit','markup'] },
  'geo-states': { title:'States', addLabel:'state', fields:[{key:'name',label:'Name'},{key:'country',label:'Country'}], cols:['name','country'] },
  'geo-cities': { title:'Cities', addLabel:'city', fields:[{key:'name',label:'Name'},{key:'country',label:'Country'},{key:'code',label:'Code'}], cols:['name','country','code'] },
  'geo-cities-mapping': { title:'Cities mapping', addLabel:'mapping', fields:[{key:'ourCity',label:'Our city'},{key:'supplier',label:'Supplier'},{key:'supplierCode',label:'Supplier code'}], cols:['ourCity','supplier','supplierCode'] },
  'geo-autocomplete': { title:'Autocomplete terms', addLabel:'term', fields:[{key:'term',label:'Term'},{key:'type',label:'Type',type:'select',options:['City','Airport','Hotel','Country']}], cols:['term','type'] },
  'geo-zones': { title:'GEO zones', addLabel:'zone', fields:[{key:'name',label:'Name'},{key:'country',label:'Country'}], cols:['name','country'] },
  'geo-airports': { title:'Airports', addLabel:'airport', fields:[{key:'code',label:'IATA code'},{key:'name',label:'Name'},{key:'city',label:'City'}], cols:['code','name','city'] },
  'translations': { title:'Translations', addLabel:'string', desc:'EN/AR copy used across the platform.', fields:[{key:'key',label:'Key'},{key:'en',label:'English'},{key:'ar',label:'Arabic'}], cols:['key','en','ar'] },
};
function collectionView(collection){
  return async el => {
    const sc = SCHEMAS[collection];
    el.innerHTML = '<div class="empty">Loading…</div>';
    const r = await getJSON(`/api/admin/content/${collection}`);
    const items = r.ok ? r.data.items : [];
    const cols = sc.cols || sc.fields.map(f=>f.key);
    const headers = cols.map(k => (sc.fields.find(f=>f.key===k)||{label:k}).label).concat(['Active','']);
    const rows = items.map(it => {
      const cells = cols.map(k => esc(String(it[k]==null?'':it[k])).slice(0,140));
      cells.push(`<button class="btn sm" data-content-toggle="${collection}:${it.id}:${it.active?0:1}">${it.active?'On':'Off'}</button>`);
      cells.push(`<button class="btn sm danger" data-content-del="${collection}:${it.id}">Delete</button>`);
      return cells;
    });
    const ncol = Math.min(sc.fields.length, 3);
    const form = `<div data-cform="${collection}" style="display:grid;grid-template-columns:repeat(${ncol},1fr);gap:12px;max-width:920px;padding:6px 0">
        ${sc.fields.map(f=>`<label style="font-size:12px;font-weight:600${f.type==='textarea'?';grid-column:1/-1':''}">${esc(f.label)}<br>${cInput(f)}</label>`).join('')}
      </div><button class="btn primary" data-content-create="${collection}">Add ${esc(sc.addLabel||'item')}</button>`;
    el.innerHTML = (sc.desc?`<p class="muted-note">${esc(sc.desc)}</p>`:'')
      + panel('Add ' + (sc.addLabel||'item'), form)
      + panel(sc.title, table(headers, rows, 'Nothing yet — add the first one above.'));
  };
}
function logView(collection, title, desc){
  return async el => {
    el.innerHTML = '<div class="empty">Loading…</div>';
    const r = await getJSON(`/api/admin/content/${collection}`);
    const items = r.ok ? r.data.items : [];
    let headers, rows;
    if (collection==='activity'){
      headers = ['Action','Detail','When'];
      rows = items.map(it=>[`<span class="pill">${esc(it.action||'')}</span>`, esc(JSON.stringify(it.detail||{})), esc(fmtDateTime(it.createdAt))]);
    } else {
      headers = ['Event','When'];
      rows = items.map(it=>{ const {id,position,active,createdAt,updatedAt,...rest}=it; return [esc(JSON.stringify(rest)), esc(fmtDateTime(it.createdAt))]; });
    }
    el.innerHTML = `<p class="muted-note">${esc(desc)}</p>` + panel(title, table(headers, rows, 'No entries yet.'));
  };
}
async function viewSystemSettings(el){
  el.innerHTML = '<div class="empty">Loading…</div>';
  const r = await getJSON('/api/admin/settings');
  const s = r.ok ? r.data.settings : {};
  const rows = Object.keys(s).sort().map(k=>[`<code>${esc(k)}</code>`, esc(String(s[k]).slice(0,120))]);
  el.innerHTML = `<p class="muted-note">Stored configuration (edit company/brand values under Company Settings).</p>`
    + panel('System settings', table(['Key','Value'], rows, 'No settings.'));
}

/* ============================ navigation ============================ */
const S = scaffold; // alias
const NAV = [
  { id:'dashboard', label:'Dashboard', icon:'grid', view:viewDashboard },
  { id:'company', label:'Company Settings', icon:'building', children:[
    { id:'company-look', label:'Look and feel', view:viewLookFeel },
    { id:'company-info', label:'Company info', view:viewCompanyInfo },
  ]},
  { id:'orders', label:'Orders', icon:'clipboard', children:[
    { id:'orders-all', label:'All Orders', view:viewAllOrders },
    { id:'orders-hold', label:'Hold Orders', view:viewHoldOrders },
    { id:'orders-flights', label:'Flights', icon:'plane', children:[
      { id:'of-all', label:'All Flights', view:viewFlights },
      { id:'of-direct', label:'Direct', view:viewFlights },
      { id:'of-b2b', label:'B2B', view:S('Flights — B2B','Flight orders placed through B2B sub-agents.') },
    ]},
    { id:'orders-hotels', label:'Hotels', icon:'bed', children:[
      { id:'oh-all', label:'All Hotels', view:viewHotels },
      { id:'oh-direct', label:'Direct', view:viewHotels },
      { id:'oh-b2b', label:'B2B', view:S('Hotels — B2B','Hotel orders placed through B2B sub-agents.') },
    ]},
  ]},
  { id:'packages', label:'Packages', icon:'layers', children:[
    { id:'pk-countries', label:'Countries', view:collectionView('pkg-countries') },
    { id:'pk-zones', label:'Zones', view:collectionView('pkg-zones') },
    { id:'pk-programs', label:'Programs', view:collectionView('pkg-programs') },
    { id:'pk-activities', label:'Activities', view:collectionView('pkg-activities') },
  ]},
  { id:'hotels', label:'Hotels', icon:'bed', children:[
    { id:'h-hotels', label:'Hotels', view:collectionView('hotel-list') },
    { id:'h-factsg', label:'Facts Group', view:collectionView('hotel-facts-group') },
    { id:'h-facts', label:'Facts', view:collectionView('hotel-facts') },
    { id:'h-suppliers', label:'Hotel Suppliers', view:collectionView('hotel-suppliers') },
    { id:'h-roomtr', label:'Room Translations', view:collectionView('hotel-room-translations') },
  ]},
  { id:'b2b', label:'B2B', icon:'globe', children:[
    { id:'b2b-agencies', label:'Agencies', view:collectionView('b2b-agencies') },
    { id:'b2b-orders', label:'Orders', view:viewAllOrders },
  ]},
  { id:'payments', label:'Payments', icon:'card', children:[
    { id:'pay-logs', label:'Payment Logs', view:viewPayments },
    { id:'pay-cur', label:'Currencies', view:viewCurrencies },
    { id:'pay-gw', label:'Payment Gateways', view:viewGateways },
  ]},
  { id:'pricing', label:'Pricing', icon:'tag', children:[
    { id:'pr-vouchers', label:'Vouchers', view:viewVouchers },
    { id:'pr-flight', label:'Flight Pricer', view:viewFlightPricer },
    { id:'pr-hotel', label:'Hotels Pricer', view:viewHotelsPricer },
    { id:'pr-test', label:'Test Tool', view:viewTestTool },
  ]},
  { id:'invoices', label:'Invoices', icon:'file', children:[
    { id:'inv-all', label:'All Invoices', view:viewInvoices },
    { id:'inv-create', label:'Create Invoice', view:viewCreateInvoice },
  ]},
  { id:'accounting', label:'Accounting', icon:'book', children:[
    { id:'ac-accounts', label:'Accounts', view:viewAccounts },
    { id:'ac-credit', label:'Credit Notes', view:viewCreditNotes },
    { id:'ac-receipts', label:'Receipts', view:viewReceipts },
    { id:'ac-linking', label:'Account linking', view:S('Account Linking','Map products to ledger accounts. Defaults are shown under Accounts.') },
    { id:'ac-journal', label:'Journal', view:viewJournal },
    { id:'ac-balance', label:'Balance Report', view:viewBalance },
    { id:'ac-stmt', label:'Account Statement', view:viewStatement },
    { id:'ac-cust', label:'Customers', view:viewCustomers },
  ]},
  { id:'customers', label:'Customers', icon:'users', view:viewCustomers },
  { id:'crm', label:'CRM', icon:'mail', children:[
    { id:'crm-messages', label:'Messages', view:viewLeads },
    { id:'crm-faq', label:'FAQ', view:collectionView('faqs') },
  ]},
  { id:'notifications', label:'Notifications', icon:'bell', children:[
    { id:'nt-notifications', label:'Notifications', view:viewNotifications },
  ]},
  { id:'reports', label:'Reports', icon:'chart', children:[
    { id:'rp-dashboard', label:'Dashboard', view:viewReports },
    { id:'rp-flights', label:'Flights', view:viewFlights },
    { id:'rp-hotels', label:'Hotels', view:viewHotels },
    { id:'rp-suppliers', label:'Suppliers', view:viewSuppliers },
    { id:'rp-agents', label:'Agents', view:emptyReport('Agents', 'Sales by internal agent.') },
    { id:'rp-agencies', label:'Agencies', view:emptyReport('Agencies', 'Sales by B2B agency.') },
    { id:'rp-supb2b', label:'Supplier B2B Agency', view:emptyReport('Supplier B2B Agency', 'Cross report of supplier versus B2B agency.') },
    { id:'rp-hold', label:'Hold Bookings', view:viewHoldOrders },
  ]},
  { id:'users', label:'Users & Roles', icon:'shield', children:[
    { id:'ur-users', label:'Users', view:viewUsers },
  ]},
  { id:'geo', label:'TK GEO Locations', icon:'pin', children:[
    { id:'geo-states', label:'States', view:collectionView('geo-states') },
    { id:'geo-cities', label:'Cities', view:collectionView('geo-cities') },
    { id:'geo-citymap', label:'Cities Mapping', view:collectionView('geo-cities-mapping') },
    { id:'geo-auto', label:'Autocomplete', view:collectionView('geo-autocomplete') },
    { id:'geo-zones', label:'Zones', view:collectionView('geo-zones') },
    { id:'geo-airports', label:'Airports', view:collectionView('geo-airports') },
  ]},
  { id:'ancillaries', label:'Ancillaries', icon:'briefcase', children:[
    { id:'an-products', label:'Products', view:collectionView('ancillary-products') },
    { id:'an-displays', label:'Displays', view:collectionView('ancillary-displays') },
  ]},
  { id:'configurations', label:'Configurations', icon:'sliders', children:[
    { id:'cf-static', label:'Static Pages', view:collectionView('static-pages') },
    { id:'cf-gds', label:'GDS', view:viewGds },
  ]},
  { id:'staticblocks', label:'B2B Static Blocks', icon:'layout', children:[
    { id:'sb-sliders', label:'Sliders', view:collectionView('block-sliders') },
    { id:'sb-pillars', label:'Main Pillars', view:collectionView('block-pillars') },
    { id:'sb-offers', label:'Offers', view:collectionView('block-offers') },
    { id:'sb-testi', label:'Customer Testimonials', view:collectionView('block-testimonials') },
    { id:'sb-partners', label:'Partner Logos', view:collectionView('block-partners') },
    { id:'sb-regp', label:'Register Pillars', view:collectionView('block-register') },
    { id:'sb-banners', label:'Product Banners', view:collectionView('block-banners') },
  ]},
  { id:'systemsettings', label:'System Settings', icon:'cog', view:viewSystemSettings },
  { id:'supplierslogs', label:'Suppliers Logs', icon:'list', view:logView('supplier-logs','Suppliers logs','Raw request/response logs from supplier APIs.') },
  { id:'productevents', label:'Product Events', icon:'activity', view:logView('product-events','Product events','Inventory and price-change events from suppliers.') },
  { id:'translations', label:'Translations', icon:'languages', children:[
    { id:'tr-manage', label:'Translation Management', view:collectionView('translations') },
  ]},
  { id:'systemlogs', label:'System Logs', icon:'terminal', children:[
    { id:'sl-activity', label:'Activity Log', view:logView('activity','Activity log','Audit trail of admin actions across the console.') },
  ]},
  { id:'fire', label:'Fire Events', icon:'alert', view:logView('fire-events','Fire events','Webhook / event-bus dispatch monitor.') },
  { id:'logout', label:'Logout', icon:'logout', danger:true, action:doLogout },
];

/* Flatten for routing + titles. */
const BY_ID = {};
(function index(items, trail){ items.forEach(n=>{ BY_ID[n.id] = { node:n, trail:[...trail, n.label] };
  if (n.children) index(n.children, [...trail, n.label]); }); })(NAV, []);

/* Build the sidebar (recursive). */
function buildNav(items, depth){
  const ul = document.createElement('div');
  items.forEach(n=>{
    const hasKids = !!n.children;
    const row = document.createElement('div');
    row.className = depth === 0 ? 'nav-item' + (n.danger?' danger':'') : 'sub-item';
    row.dataset.id = n.id;
    const ic = depth === 0 ? icon(n.icon || 'grid') : (n.icon ? icon(n.icon,'ico') : '');
    row.innerHTML = `${ic}<span class="label">${esc(n.label)}</span>${hasKids?chev:''}`;
    ul.appendChild(row);
    if (hasKids){
      const sub = buildNav(n.children, depth+1);
      sub.className = 'subnav';
      sub.dataset.group = n.id;
      ul.appendChild(sub);
      row.addEventListener('click', e => { e.stopPropagation(); row.classList.toggle('open'); sub.classList.toggle('open'); });
    } else {
      row.addEventListener('click', e => { e.stopPropagation();
        if (n.action) return n.action();
        location.hash = n.id;
        if (window.innerWidth <= 980) $('#sidebar').classList.remove('show');
      });
    }
  });
  return ul;
}

/* Open ancestor groups + highlight active leaf. */
function setActive(id){
  document.querySelectorAll('.nav-item,.sub-item').forEach(x=>x.classList.remove('active'));
  const info = BY_ID[id]; if (!info) return;
  const row = document.querySelector(`[data-id="${id}"]`);
  if (row) row.classList.add('active');
  // open all ancestor groups
  let cur = row;
  while (cur){
    const group = cur.closest('.subnav');
    if (!group) break;
    group.classList.add('open');
    const head = document.querySelector(`[data-id="${group.dataset.group}"]`);
    if (head) head.classList.add('open');
    cur = head;
  }
}

/* ------------------------------ router ------------------------------ */
let currentId = 'dashboard';
async function route(){
  let id = (location.hash || '#dashboard').slice(1);
  let info = BY_ID[id];
  // if a group id was hit, jump to its first leaf
  while (info && info.node.children) { id = info.node.children[0].id; info = BY_ID[id]; }
  if (!info){ id = 'dashboard'; info = BY_ID[id]; }
  currentId = id;
  setActive(id);
  $('#title').textContent = info.node.label;
  $('#crumb').textContent = info.trail.slice(0, -1).join(' › ') || 'Admin';
  const el = $('#view');
  try { await (info.node.view || scaffold(info.node.label))(el); }
  catch (e){ el.innerHTML = '<div class="empty">Something went wrong loading this view.</div>'; }
}

/* ----------------------------- actions ----------------------------- */
async function doLogout(){
  await post('/api/auth/logout', {});
  location.href = '../pages/login.html';
}
document.addEventListener('click', async e => {
  const rf = e.target.closest('[data-refund]');
  if (rf){ if (!confirm('Refund this payment and reverse the booking?')) return;
    const r = await post(`/api/payments/${rf.dataset.refund}/refund`, {});
    toast(r.ok ? 'Payment refunded' : (r.data.error || 'Refund failed')); if (r.ok) route(); return; }
  const vs = e.target.closest('[data-visa]');
  if (vs){ const r = await patch(`/api/admin/visas/${vs.dataset.visa}`, { status: vs.dataset.status });
    toast(r.ok ? 'Visa updated' : (r.data.error || 'Update failed')); if (r.ok) route(); return; }
  // Pricing: save markup
  const mk = e.target.closest('[data-save-markup]');
  if (mk){ const v = parseFloat(($('#mk-input')||{}).value || '0');
    const r = await put('/api/admin/pricing', { product: mk.dataset.saveMarkup, markupPercent: v });
    toast(r.ok ? `Markup saved (${v}%)` : (r.data.error || 'Save failed')); if (r.ok) route(); return; }
  // Pricing: create voucher
  if (e.target.id === 'v-create'){
    const body = { code: ($('#v-code')||{}).value, kind: ($('#v-kind')||{}).value, value: ($('#v-value')||{}).value };
    const r = await post('/api/admin/vouchers', body);
    toast(r.ok ? 'Voucher created' : (r.data.error || 'Could not create')); if (r.ok) route(); return; }
  // Pricing: toggle voucher
  const vt = e.target.closest('[data-voucher-toggle]');
  if (vt){ const r = await patch(`/api/admin/vouchers/${vt.dataset.voucherToggle}`, { active: vt.dataset.active === '1' });
    toast(r.ok ? 'Voucher updated' : (r.data.error || 'Update failed')); if (r.ok) route(); return; }
  // Navigate via a button (e.g. "+ Create invoice")
  const go = e.target.closest('[data-goto]');
  if (go){ location.hash = go.dataset.goto; return; }
  // Generic content collections: create / delete / toggle
  const cc = e.target.closest('[data-content-create]');
  if (cc){ const coll = cc.dataset.contentCreate; const form = document.querySelector(`[data-cform="${coll}"]`);
    const data = {}; form.querySelectorAll('[data-cfield]').forEach(i => { if (i.value !== '') data[i.dataset.cfield] = i.value; });
    if (!Object.keys(data).length){ toast('Fill in at least one field'); return; }
    const r = await post(`/api/admin/content/${coll}`, { data });
    toast(r.ok ? 'Added' : (r.data.error || 'Could not add')); if (r.ok) route(); return; }
  const cdl = e.target.closest('[data-content-del]');
  if (cdl){ if (!confirm('Delete this item?')) return; const [coll, id] = cdl.dataset.contentDel.split(':');
    const r = await del(`/api/admin/content/${coll}/${id}`); toast(r.ok ? 'Deleted' : 'Delete failed'); if (r.ok) route(); return; }
  const ctg = e.target.closest('[data-content-toggle]');
  if (ctg){ const [coll, id, active] = ctg.dataset.contentToggle.split(':');
    const r = await patch(`/api/admin/content/${coll}/${id}`, { active: active === '1' }); toast(r.ok ? 'Updated' : 'Update failed'); if (r.ok) route(); return; }
  // Company Settings: save
  const ss = e.target.closest('[data-save-settings]');
  if (ss){ const obj = {};
    document.querySelectorAll('[data-setting]').forEach(inp => { obj[inp.dataset.setting] = inp.value; });
    const r = await put('/api/admin/settings', { settings: obj });
    toast(r.ok ? 'Settings saved' : (r.data.error || 'Could not save')); if (r.ok) route(); return; }
  // Invoices: create
  if (e.target.id === 'ci-create'){
    const body = { contact: ($('#ci-contact')||{}).value, description: ($('#ci-desc')||{}).value, amount: ($('#ci-amount')||{}).value };
    const r = await post('/api/admin/invoices', body);
    if (r.ok){ toast(`Invoice ${r.data.invoice.number} created`); location.hash = 'inv-all'; }
    else toast(r.data.error || 'Could not create invoice');
    return; }
  // Notifications: send
  if (e.target.id === 'nt-send'){
    const body = { channel: ($('#nt-channel')||{}).value, recipient: ($('#nt-to')||{}).value,
      subject: ($('#nt-subject')||{}).value, body: ($('#nt-body')||{}).value };
    const r = await post('/api/admin/notifications', body);
    toast(r.ok ? 'Notification sent' : (r.data.error || 'Could not send')); if (r.ok) route(); return; }
  // Pricing: test tool
  if (e.target.id === 'tt-run'){
    const city = ($('#tt-city')||{}).value || 'Dubai';
    const ci = ($('#tt-in')||{}).value, co = ($('#tt-out')||{}).value;
    const out = $('#tt-result'); out.innerHTML = '<div class="empty">Searching…</div>';
    const r = await getJSON(`/api/hotels/search?city=${encodeURIComponent(city)}&checkIn=${ci}&checkOut=${co}&guests=2`);
    if (!r.ok || !(r.data.hotels||[]).length){ out.innerHTML = '<div class="empty">No results — check the dates.</div>'; return; }
    const rows = r.data.hotels.flatMap(h => h.rooms.map(rm => [esc(h.name), esc(rm.roomName), esc(money(rm.nightlyPrice,rm.currency)), esc(money(rm.totalPrice,rm.currency))]));
    out.innerHTML = table(['Hotel','Room','Nightly (quoted)','Total (quoted)'], rows);
    return; }
});

/* ------------------------------ boot ------------------------------ */
async function boot(){
  const me = await getJSON('/api/auth/me');
  const user = me.ok ? me.data.user : null;
  if (!user || user.role !== 'admin'){
    $('#nav').innerHTML = '';
    $('#whoami').innerHTML = 'Not signed in';
    $('#view').innerHTML = `<div class="gate"><h2>Admin sign-in required</h2>
      <p>Sign in with an administrator account to open the console.</p>
      <a class="btn primary" href="../pages/login.html">Go to login</a></div>`;
    $('#title').textContent = 'Sign in';
    return;
  }
  $('#whoami').innerHTML = `Welcome,<b>${esc(user.name || user.email || user.mobile)}</b>`;
  $('#nav').appendChild(buildNav(NAV, 0));
  $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('show'));
  $('#refreshBtn').addEventListener('click', () => route());
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = 'dashboard';
  route();
}
boot();
})();
