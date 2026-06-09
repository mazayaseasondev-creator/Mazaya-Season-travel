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

/* --- Demo login validation ---
   NOTE: This is front-end only and is NOT real security. It just stops the
   form from continuing with empty / obviously-invalid input. Real
   authentication (OTP verification, sessions) must be done on a backend
   before launch. */
function demoLogin(){
  const id = (document.getElementById('login-id') || {}).value || '';
  const otp = (document.getElementById('login-otp') || {}).value || '';
  const idOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(id.trim()) || /^[0-9]{7,}$/.test(id.replace(/\s/g, ''));
  if (!idOk){ toast('Enter a valid email or mobile number'); return; }
  if (!/^[0-9]{6}$/.test(otp.trim())){ toast('Enter the 6-digit code'); return; }
  location.href = 'account.html';
}
