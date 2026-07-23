/* ═══════════════════════════════════════════════════════════════════════════
   SmartPOS — Mobile App JavaScript
   Auth → Scan → Cart → Payment → Success
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ──────────────────────────────────────────────────────────────────
let state = {
  user:      null,   // { username, role }
  cart:      null,   // { cart_id, cart_name, items, total, ... }
  scanTimer: null,
  pollTimer: null,
  billId:    null,
};

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const saved = tryLoad('sp_user');
  if (saved) {
    state.user = saved;
    afterLogin();
  }
  // Load available carts in background
  loadAvailableCarts();
});

// ─── Utilities ───────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function setLoading(btn, loading) {
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  if (!text || !spinner) return;
  text.hidden    =  loading;
  spinner.hidden = !loading;
  btn.disabled   =  loading;
}

function trySave(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e){} }
function tryLoad(key)       { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
function tryRemove(key)     { try { localStorage.removeItem(key); } catch(e){} }

// ─── Auth Tab ────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  const indicator = document.getElementById('auth-tab-indicator');
  if (tab === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-register').classList.remove('active');
    document.getElementById('form-login').classList.remove('hidden');
    document.getElementById('form-register').classList.add('hidden');
    indicator.style.left = '0%';
  } else {
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
    indicator.style.left = '50%';
  }
}

function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const btn      = document.getElementById('login-btn');
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  if (!username || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Login failed');
    state.user = { username: data.username, role: data.role };
    trySave('sp_user', state.user);
    afterLogin();
  } catch(err) {
    errEl.textContent = err.message;
  } finally {
    setLoading(btn, false);
  }
}

// ─── Register ────────────────────────────────────────────────────────────────
async function handleRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';
  const btn      = document.getElementById('register-btn');
  const username = document.getElementById('reg-user').value.trim();
  const password = document.getElementById('reg-pass').value;
  if (!username || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Registration failed');
    state.user = { username: data.username, role: data.role };
    trySave('sp_user', state.user);
    afterLogin();
  } catch(err) {
    errEl.textContent = err.message;
  } finally {
    setLoading(btn, false);
  }
}

function afterLogin() {
  const u = state.user;
  document.getElementById('nav-username').textContent = u.username;
  document.getElementById('nav-avatar').textContent   = u.username[0].toUpperCase();
  // Admin goes to dashboard? No — same mobile flow for now.
  loadAvailableCarts();
  showScreen('screen-scan');
}

function logout() {
  stopScanner();
  stopPolling();
  if (state.cart) {
    fetch('/api/carts/unpair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: state.cart.cart_id }),
    }).catch(() => {});
    state.cart = null;
  }
  state.user = null;
  tryRemove('sp_user');
  showScreen('screen-auth');
  toast('Signed out successfully.');
}

// ─── Available Carts ─────────────────────────────────────────────────────────
async function loadAvailableCarts() {
  const container = document.getElementById('available-carts-list');
  if (!container) return;
  try {
    const res  = await fetch('/api/carts');
    const data = await res.json();
    const carts = data.carts || [];
    container.innerHTML = '';
    if (carts.length === 0) {
      container.innerHTML = '<p style="font-size:13px;color:#93939f;text-align:center;padding:12px">No carts available.</p>';
      return;
    }
    carts.forEach(cart => {
      const avail = cart.status === 'available';
      const div = document.createElement('div');
      div.className = `cart-list-item ${avail ? '' : 'unavailable'}`;
      div.innerHTML = `
        <div class="cart-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
          </svg>
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${cart.name || cart.cart_id}</div>
          <div class="cart-item-meta">${cart.total_items} item${cart.total_items !== 1 ? 's' : ''} · Rs.${cart.total_price}</div>
        </div>
        <span class="cart-status-pill ${avail ? '' : 'busy'}">${avail ? 'Available' : 'In Use'}</span>`;
      if (avail) div.onclick = () => pairCart(cart.cart_id, cart.name);
      container.appendChild(div);
    });
  } catch(e) {
    if (container) container.innerHTML = '<p style="font-size:13px;color:#93939f;text-align:center;padding:12px">Could not load carts.</p>';
  }
}

// ─── QR Scanner ──────────────────────────────────────────────────────────────
let videoStream   = null;
let scanningActive = false;

async function startScanner() {
  const video  = document.getElementById('qr-video');
  const idle   = document.getElementById('qr-idle-msg');
  const btn    = document.getElementById('btn-scan-start');
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = videoStream;
    idle.classList.add('hidden');
    btn.style.display = 'none';
    scanningActive = true;
    scanningLoop();
    toast('Camera active — aim at cart QR code');
  } catch(e) {
    toast('Camera access denied. Use manual entry.', 'error');
  }
}

function stopScanner() {
  scanningActive = false;
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
}

function scanningLoop() {
  if (!scanningActive) return;
  const video  = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  if (!video || !canvas) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx  = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code) {
      const raw = code.data.trim();
      // Expect "SMARTPOS:CART-101" or plain "CART-101"
      const cartId = raw.startsWith('SMARTPOS:') ? raw.split(':')[1] : raw;
      if (/^CART-/i.test(cartId)) {
        stopScanner();
        pairCart(cartId.toUpperCase());
        return;
      }
    }
  }
  requestAnimationFrame(scanningLoop);
}

function manualPair() {
  const input  = document.getElementById('manual-cart-id');
  const cartId = (input.value || '').trim().toUpperCase();
  if (!cartId) { toast('Enter a Cart ID first.', 'error'); return; }
  pairCart(cartId);
}

// ─── Pair Cart ────────────────────────────────────────────────────────────────
async function pairCart(cartId, name) {
  try {
    const res  = await fetch('/api/carts/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: cartId, username: state.user?.username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not pair');
    toast(`Connected to ${data.cart_name || cartId}!`, 'success');
    state.cart = { cart_id: cartId, cart_name: data.cart_name || name || cartId };
    document.getElementById('nav-cart-name').textContent    = state.cart.cart_name;
    document.getElementById('nav-cart-id-label').textContent = cartId;
    showScreen('screen-cart');
    startPolling(cartId);
  } catch(e) {
    toast(e.message, 'error');
  }
}

async function unpairCart() {
  stopPolling();
  if (state.cart) {
    await fetch('/api/carts/unpair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: state.cart.cart_id }),
    }).catch(() => {});
    state.cart = null;
  }
  loadAvailableCarts();
  showScreen('screen-scan');
}

// ─── Cart Polling ─────────────────────────────────────────────────────────────
function startPolling(cartId) {
  stopPolling();
  pollCart(cartId);
  state.pollTimer = setInterval(() => pollCart(cartId), 2500);
}

function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

async function pollCart(cartId) {
  try {
    const res  = await fetch(`/api/cart/${encodeURIComponent(cartId)}`);
    if (!res.ok) return;
    const data = await res.json();
    renderCart(data);
  } catch(e) { /* offline */ }
}

function renderCart(data) {
  const items    = data.items || [];
  const list     = document.getElementById('cart-items-list');
  const empty    = document.getElementById('cart-empty');
  const countEl  = document.getElementById('cart-item-count');
  const totalEl  = document.getElementById('cart-total');
  const checkBtn = document.getElementById('checkout-btn');
  const wBadge   = document.getElementById('weight-badge');

  // Weight badge
  const ws = data.weight_sensor || {};
  wBadge.title = `${ws.status_text} — current: ${ws.current_g}g, expected: ${ws.expected_g}g`;
  wBadge.classList.toggle('warn', !ws.is_valid && items.length > 0);

  if (items.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.hidden = false;
    checkBtn.disabled = true;
    countEl.textContent = '0';
    totalEl.textContent = 'Rs. 0';
    return;
  }
  empty.hidden = true;
  checkBtn.disabled = false;

  const total      = data.total || 0;
  const totalItems = data.total_items || 0;
  countEl.textContent = totalItems;
  totalEl.textContent = `Rs. ${total}`;

  // Re-render only if changed
  const sig = JSON.stringify(items);
  if (list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  list.innerHTML = '';
  list.appendChild(empty);

  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'cart-item-row';
    div.innerHTML = `
      <div class="cart-item-num">${idx + 1}</div>
      <div class="cart-item-details">
        <div class="cart-item-name">${item.item}</div>
        <div class="cart-item-uid">${item.uid}</div>
        <div class="cart-item-qty">Qty: ${item.quantity}</div>
      </div>
      <div class="cart-item-price">Rs. ${item.price * item.quantity}</div>
      <button class="btn-remove" onclick="removeItem(${idx})" aria-label="Remove ${item.item}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>`;
    list.appendChild(div);
  });
}

async function removeItem(idx) {
  if (!state.cart) return;
  try {
    await fetch(`/api/cart/${state.cart.cart_id}/remove/${idx}`, { method: 'POST' });
  } catch(e) { toast('Could not remove item.', 'error'); }
}

// ─── Payment ──────────────────────────────────────────────────────────────────
function openPayment() {
  if (!state.cart) return;
  const total = document.getElementById('cart-total').textContent;
  document.getElementById('pay-amount').textContent   = total;
  document.getElementById('pay-cart-label').textContent = state.cart.cart_id;
  updatePaymentUI();
  showScreen('screen-payment');
}

function updatePaymentUI() {
  const method = document.querySelector('input[name="pay-method"]:checked')?.value || 'card';
  document.querySelectorAll('.pay-method-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    card.classList.toggle('selected', radio?.value === method);
  });
  document.getElementById('card-details').classList.toggle('hidden', method !== 'card');
  document.getElementById('upi-details').classList.toggle('hidden', method !== 'upi');
  document.getElementById('wallet-details').classList.toggle('hidden', method !== 'wallet');
  const btn = document.getElementById('pay-btn-text');
  if (btn) btn.textContent = method === 'upi' ? 'Verify & Pay' : method === 'wallet' ? 'Send Link' : 'Pay Now';
}

async function processPayment() {
  if (!state.cart) return;
  const btn = document.getElementById('pay-btn');
  setLoading(btn, true);
  // Simulate payment processing delay
  await new Promise(r => setTimeout(r, 1600));
  try {
    const res = await fetch(`/api/cart/${state.cart.cart_id}/checkout?username=${encodeURIComponent(state.user?.username || '')}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Checkout failed');
    stopPolling();
    state.billId = data.bill_id;
    showSuccessScreen(data);
  } catch(e) {
    toast(e.message, 'error');
    setLoading(btn, false);
  }
}

function showSuccessScreen(data) {
  document.getElementById('receipt-bill-id').textContent  = `#${data.bill_id}`;
  document.getElementById('receipt-cart-id').textContent  = data.cart_id;
  document.getElementById('receipt-amount').textContent   = `Rs. ${data.total}`;
  document.getElementById('success-sub').textContent      =
    `Rs. ${data.total} paid via ${document.querySelector('input[name="pay-method"]:checked')?.value || 'card'}.`;
  showScreen('screen-success');
}

function downloadReceipt() {
  if (!state.billId) return;
  window.open(`/api/bills/${state.billId}/pdf`, '_blank');
}

function startNewSession() {
  state.cart  = null;
  state.billId = null;
  loadAvailableCarts();
  showScreen('screen-scan');
}

// ─── Card formatter ───────────────────────────────────────────────────────────
function formatCardNumber(input) {
  let v = input.value.replace(/\D/g,'').substring(0,16);
  input.value = v.match(/.{1,4}/g)?.join(' ') || v;
}
