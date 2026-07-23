/* ═══════════════════════════════════════════════════════════════════════════
   SmartPOS Management Console — Dashboard JS
   Auth → Overview / Live Carts / Inventory / QR Codes
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let dash = {
  user:         null,
  currentView:  'overview',
  selectedCart: null,
  pollTimer:    null,
};

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwa-install-btn-admin');
  if (btn) btn.style.display = 'inline-flex';
});

function installPWA() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        toast('PWA installed successfully!', 'success');
      }
      deferredPrompt = null;
      const btn = document.getElementById('pwa-install-btn-admin');
      if (btn) btn.style.display = 'none';
    });
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW reg error:', err));
  }
  
  // Check any saved session
  const saved = tryLoad('smartpos_user') || tryLoad('sp_admin') || tryLoad('sp_user');
  if (saved) {
    if (saved.role !== 'admin') {
      tryRemove('sp_admin');
      const errEl = document.getElementById('gate-login-err');
      if (errEl) {
        errEl.style.color = '#b30000';
        errEl.textContent = 'Customer account detected. Redirecting to Mobile App...';
      }
      setTimeout(() => { window.location.href = '/mobile'; }, 800);
      return;
    }
    dash.user = saved;
    enterDashboard();
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function tryLoad(k)    { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
function trySave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function tryRemove(k)  { try { localStorage.removeItem(k); } catch(e){} }

function toast(msg, type = '') {
  const t = document.getElementById('dash-toast');
  t.textContent = msg;
  t.className   = `dash-toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function setLoading(btn, on) {
  const txt = btn.querySelector('.btn-text');
  const sp  = btn.querySelector('.btn-spin');
  if (!txt || !sp) return;
  txt.hidden = on; sp.hidden = !on;
  btn.disabled = on;
}

function showGate(id) {
  document.querySelectorAll('.gate').forEach(g => g.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Auth Gate Tabs ────────────────────────────────────────────────────────────
function switchGateTab(tab) {
  const bar = document.getElementById('gtab-bar');
  if (tab === 'login') {
    document.getElementById('gtab-login').classList.add('active');
    document.getElementById('gtab-reg').classList.remove('active');
    document.getElementById('gate-login').classList.remove('hidden');
    document.getElementById('gate-reg').classList.add('hidden');
    bar.style.left = '0%';
  } else {
    document.getElementById('gtab-login').classList.remove('active');
    document.getElementById('gtab-reg').classList.add('active');
    document.getElementById('gate-login').classList.add('hidden');
    document.getElementById('gate-reg').classList.remove('hidden');
    bar.style.left = '50%';
  }
}

// ─── Admin Login ──────────────────────────────────────────────────────────────
async function adminLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('gate-login-err');
  errEl.textContent = '';
  const btn  = document.getElementById('gate-login-btn');
  const user = document.getElementById('g-user').value.trim();
  const pass = document.getElementById('g-pass').value;
  if (!user || !pass) { errEl.textContent = 'Please enter username and password.'; return; }
  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Login failed');
    
    // Save session
    const userInfo = { username: data.username, role: data.role };
    trySave('smartpos_user', userInfo);
    
    if (data.role !== 'admin') {
      trySave('sp_user', userInfo);
      errEl.style.color = '#b30000';
      errEl.textContent = 'Access denied: Customer accounts must use the Mobile App. Redirecting...';
      setTimeout(() => { window.location.href = '/mobile'; }, 1200);
      return;
    }
    
    dash.user = userInfo;
    trySave('sp_admin', dash.user);
    enterDashboard();
  } catch(err) {
    errEl.style.color = '#b30000';
    errEl.textContent = err.message;
  } finally {
    setLoading(btn, false);
  }
}

// ─── Admin Register ──────────────────────────────────────────────────────────
async function adminRegister(e) {
  e.preventDefault();
  const errEl = document.getElementById('gate-reg-err');
  errEl.textContent = '';
  const btn  = document.getElementById('gate-reg-btn');
  const user = document.getElementById('gr-user').value.trim();
  const pass = document.getElementById('gr-pass').value;
  if (!user || !pass) { errEl.textContent = 'Please fill in all fields.'; return; }
  setLoading(btn, true);
  try {
    const res  = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass, role: 'customer' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Registration failed');
    
    const userInfo = { username: data.username, role: data.role };
    trySave('sp_user', userInfo);
    trySave('smartpos_user', userInfo);
    
    errEl.style.color = '#003c33';
    errEl.textContent = 'Customer account created! Redirecting to Mobile App...';
    setTimeout(() => { window.location.href = '/mobile'; }, 1200);
  } catch(err) {
    errEl.style.color = '#b30000';
    errEl.textContent = err.message;
  } finally {
    setLoading(btn, false);
  }
}


function adminLogout() {
  stopDashPoll();
  dash.user = null;
  tryRemove('sp_admin');
  showGate('auth-gate');
}

// ─── Enter Dashboard ──────────────────────────────────────────────────────────
function enterDashboard() {
  const u = dash.user;
  document.getElementById('sf-username').textContent = u.username;
  document.getElementById('sf-avatar').textContent   = u.username[0].toUpperCase();
  document.getElementById('sf-role').textContent     = u.role === 'admin' ? 'Administrator' : 'Staff';
  showGate('dashboard');
  switchView('overview');
  startDashPoll();
}

// ─── View Switching ───────────────────────────────────────────────────────────
function switchView(view, btnEl) {
  dash.currentView = view;
  document.querySelectorAll('.dash-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelectorAll('.snav-item').forEach(b => b.classList.remove('active'));
  const target = btnEl || document.querySelector(`[data-view="${view}"]`);
  if (target) target.classList.add('active');
  const titles = { overview: 'Overview', carts: 'Live Carts', inventory: 'Inventory Management', qrcodes: 'Cart QR Codes' };
  document.getElementById('dash-page-title').textContent = titles[view] || view;
  loadView(view);
}

function loadView(view) {
  switch(view) {
    case 'overview':   loadOverview(); break;
    case 'carts':      loadCarts(); break;
    case 'inventory':  loadInventory(); break;
    case 'qrcodes':    loadQRCodes(); break;
  }
}

// ─── Auto-poll ────────────────────────────────────────────────────────────────
function startDashPoll() {
  stopDashPoll();
  dash.pollTimer = setInterval(() => loadView(dash.currentView), 4000);
}
function stopDashPoll() {
  if (dash.pollTimer) { clearInterval(dash.pollTimer); dash.pollTimer = null; }
}

// ─── Overview ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  await Promise.all([loadStats(), loadOverviewCarts()]);
}

async function loadStats() {
  try {
    const res  = await fetch('/api/inventory/summary');
    const data = await res.json();
    document.getElementById('stat-products').textContent = data.total_products;
    document.getElementById('stat-shelf').textContent    = data.shelf_stock;
    document.getElementById('stat-carts').textContent    = data.active_carts;
    document.getElementById('stat-sold').textContent     = data.total_sold;
  } catch(e) {}
}

async function loadOverviewCarts() {
  const container = document.getElementById('overview-cart-list');
  try {
    const res   = await fetch('/api/carts');
    const data  = await res.json();
    const carts = data.carts || [];
    container.innerHTML = '';
    carts.forEach(cart => {
      const card = document.createElement('div');
      card.className = 'overview-cart-card';
      card.onclick = () => openCartModal(cart.cart_id);
      const isPaired = cart.status === 'paired';
      card.innerHTML = `
        <div class="oc-badge">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        </div>
        <div class="oc-info">
          <div class="oc-name">${cart.name || cart.cart_id}</div>
          <div class="oc-meta">${cart.total_items} item${cart.total_items !== 1 ? 's' : ''} ${cart.paired_user ? '· User: ' + cart.paired_user : ''}</div>
        </div>
        <span class="oc-status ${isPaired ? 'active' : 'idle'}">${isPaired ? 'In Use' : 'Available'}</span>
        <div class="oc-total">Rs. ${cart.total_price}</div>`;
      container.appendChild(card);
    });
  } catch(e) {}
}

// ─── Live Carts ───────────────────────────────────────────────────────────────
async function loadCarts() {
  const grid = document.getElementById('carts-grid');
  try {
    const res   = await fetch('/api/carts');
    const data  = await res.json();
    const carts = data.carts || [];
    grid.innerHTML = '';
    carts.forEach(cart => {
      const isPaired = cart.status === 'paired';
      const card = document.createElement('div');
      card.className = 'cart-card';
      card.innerHTML = `
        <div class="cart-card-header">
          <div>
            <div class="cart-card-name">${cart.name || cart.cart_id}</div>
            <div class="cart-card-id">${cart.cart_id}</div>
          </div>
          <span class="cart-pill ${isPaired ? 'paired' : 'available'}">${isPaired ? 'In Use' : 'Available'}</span>
        </div>
        <div class="cart-card-body">
          <div class="cart-info-row"><span class="cart-info-label">Items</span><span class="cart-info-val">${cart.total_items}</span></div>
          <div class="cart-info-row"><span class="cart-info-label">Total</span><span class="cart-info-val">Rs. ${cart.total_price}</span></div>
          <div class="cart-info-row"><span class="cart-info-label">User</span><span class="cart-info-val">${cart.paired_user || '—'}</span></div>
        </div>
        <div class="cart-card-foot">
          <button class="pill-btn" onclick="seedCart2('${cart.cart_id}')">Seed Items</button>
          <button class="pill-btn" onclick="openCartModal('${cart.cart_id}')">View Details</button>
        </div>`;
      grid.appendChild(card);
    });
  } catch(e) {
    grid.innerHTML = `<p style="color:#93939f;font-size:13px;">Could not load carts.</p>`;
  }
}

function refreshCarts() { loadCarts(); toast('Carts refreshed'); }

// ─── Inventory ────────────────────────────────────────────────────────────────
async function loadInventory() {
  const tbody = document.getElementById('inventory-tbody');
  try {
    const res  = await fetch('/api/products');
    const data = await res.json();
    const prods = Object.entries(data);
    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No products found. Add your first product.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    prods.forEach(([uid, prod]) => {
      const shelf = prod.shelf_stock ?? 0;
      let stockClass = 'ok';
      let stockText  = 'In Stock';
      if (shelf === 0)       { stockClass = 'out'; stockText = 'Out of Stock'; }
      else if (shelf < 15)   { stockClass = 'low'; stockText = 'Low Stock'; }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight:600">${prod.item}</td>
        <td><span class="uid-mono">${uid}</span></td>
        <td>Rs. ${prod.price}</td>
        <td>${shelf}</td>
        <td>${prod.warehouse_stock ?? 0}</td>
        <td><span class="stock-pill ${stockClass}">${stockText}</span></td>
        <td>
          <button class="btn-del" onclick="deleteProduct('${uid}', '${prod.item}')" title="Delete product">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Failed to load products.</td></tr>';
  }
}

function openAddProduct() {
  document.getElementById('add-product-panel').classList.remove('hidden');
}
function closeAddProduct() {
  document.getElementById('add-product-panel').classList.add('hidden');
  document.getElementById('add-product-form').reset();
  document.getElementById('add-prod-err').textContent = '';
}

async function addProduct(e) {
  e.preventDefault();
  const errEl = document.getElementById('add-prod-err');
  errEl.textContent = '';
  const btn = document.getElementById('add-prod-btn');
  const uid   = (document.getElementById('new-uid').value || '').trim().toUpperCase();
  const name  = (document.getElementById('new-name').value || '').trim();
  const price = parseInt(document.getElementById('new-price').value) || 0;
  const shelf = parseInt(document.getElementById('new-shelf').value) || 50;
  const wh    = parseInt(document.getElementById('new-wh').value) || 200;
  if (!uid || !name || !price) { errEl.textContent = 'UID, name, and price are required.'; return; }
  setLoading(btn, true);
  try {
    const res  = await fetch('/api/inventory/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, item: name, price, shelf_stock: shelf, warehouse_stock: wh }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Failed to add product');
    toast(`Added ${name}`, 'success');
    closeAddProduct();
    loadInventory();
  } catch(err) {
    errEl.textContent = err.message;
  } finally {
    setLoading(btn, false);
  }
}

async function deleteProduct(uid, name) {
  if (!confirm(`Delete "${name}" (${uid})?`)) return;
  try {
    const res = await fetch(`/api/inventory/products/${encodeURIComponent(uid)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    toast(`Deleted ${name}`);
    loadInventory();
  } catch(e) {
    toast('Could not delete product.', 'error');
  }
}

// ─── QR Codes ─────────────────────────────────────────────────────────────────
async function loadQRCodes() {
  const grid = document.getElementById('qr-grid');
  try {
    const res   = await fetch('/api/carts');
    const data  = await res.json();
    const carts = data.carts || [];
    grid.innerHTML = '';
    carts.forEach(cart => {
      const wrapper = document.createElement('div');
      wrapper.className = 'qr-card';
      const canvasId = `qr-${cart.cart_id}`;
      const isPaired = cart.status === 'paired';
      wrapper.innerHTML = `
        <div class="qr-card-title">${cart.name || cart.cart_id}</div>
        <div class="qr-card-sub">${cart.cart_id}</div>
        <div class="qr-canvas-wrap"><canvas id="${canvasId}"></canvas></div>
        <div class="qr-payload">SMARTPOS:${cart.cart_id}</div>
        <span class="qr-badge ${isPaired ? 'paired' : 'available'}">${isPaired ? 'In Use' : 'Available'}</span>
        <button class="btn-print-qr" onclick="printQR('${cart.cart_id}', '${cart.name || cart.cart_id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          Print QR
        </button>
        <div class="qr-note">This QR code is permanent — same cart, same code, always.</div>`;
      grid.appendChild(wrapper);
      // Generate QR
      setTimeout(() => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        QRCode.toCanvas(canvas, `SMARTPOS:${cart.cart_id}`, {
          width: 160, margin: 1,
          color: { dark: '#003c33', light: '#eeece7' },
        }).catch(err => console.error('QR gen error', err));
      }, 50);
    });
  } catch(e) {
    grid.innerHTML = '<p style="color:#93939f;font-size:13px;">Could not load carts.</p>';
  }
}

function printQR(cartId, cartName) {
  const canvasEl = document.getElementById(`qr-${cartId}`);
  if (!canvasEl) return;
  const win  = window.open('', '_blank');
  const img  = canvasEl.toDataURL();
  win.document.write(`
    <html><head><title>QR — ${cartName}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#fff;}
    h2{font-size:20px;color:#003c33;margin-bottom:6px;}
    p{color:#93939f;font-size:13px;margin-bottom:20px;}
    img{border:1px solid #d9d9dd;padding:12px;border-radius:8px;}
    .sub{margin-top:10px;font-size:11px;color:#75758a;}</style>
    </head><body>
    <h2>${cartName}</h2>
    <p>Scan to connect your SmartPOS cart</p>
    <img src="${img}"/>
    <div class="sub">SMARTPOS:${cartId} &nbsp;·&nbsp; Static QR — never changes</div>
    <script>window.print();window.onafterprint=()=>window.close();<\/script>
    </body></html>`);
  win.document.close();
}

// ─── Cart Modal ───────────────────────────────────────────────────────────────
async function openCartModal(cartId) {
  dash.selectedCart = cartId;
  const modal = document.getElementById('cart-modal');
  const body  = document.getElementById('modal-cart-body');
  const title = document.getElementById('modal-cart-title');
  title.textContent = `Cart: ${cartId}`;
  body.textContent  = 'Loading…';
  modal.classList.remove('hidden');
  try {
    const res  = await fetch(`/api/cart/${encodeURIComponent(cartId)}`);
    const data = await res.json();
    const items = data.items || [];
    const total = data.total || 0;
    if (items.length === 0) {
      body.innerHTML = '<p style="color:#93939f;text-align:center;padding:24px 0;">Cart is empty.</p>';
    } else {
      body.innerHTML = `
        ${items.map(item => `
          <div class="modal-item-row">
            <span class="modal-item-name">${item.item}</span>
            <span class="modal-item-qty">×${item.quantity}</span>
            <span class="modal-item-price">Rs. ${item.price * item.quantity}</span>
          </div>`).join('')}
        <div class="modal-total-row">
          <span>Total</span><span>Rs. ${total}</span>
        </div>
        <p style="font-size:11px;color:#93939f;margin-top:12px;">
          Weight: ${data.weight_sensor?.current_g}g · ${data.weight_sensor?.status_text}
          ${data.paired_user ? ` · User: ${data.paired_user}` : ''}
        </p>`;
    }
  } catch(e) {
    body.innerHTML = '<p style="color:#b30000;">Failed to load cart data.</p>';
  }
}

function closeCartModal(event) {
  if (event && event.target !== document.getElementById('cart-modal')) return;
  document.getElementById('cart-modal').classList.add('hidden');
  dash.selectedCart = null;
}

async function clearCart() {
  if (!dash.selectedCart) return;
  if (!confirm(`Clear all items from ${dash.selectedCart}?`)) return;
  try {
    await fetch(`/api/cart/${dash.selectedCart}/clear`, { method: 'POST' });
    toast('Cart cleared', 'success');
    openCartModal(dash.selectedCart);
    loadView(dash.currentView);
  } catch(e) { toast('Failed to clear cart', 'error'); }
}

async function seedCart() {
  if (!dash.selectedCart) return;
  await seedCart2(dash.selectedCart);
  openCartModal(dash.selectedCart);
}

async function seedCart2(cartId) {
  try {
    await fetch(`/api/carts/${encodeURIComponent(cartId)}/seed`, { method: 'POST' });
    toast(`Seeded mock items for ${cartId}`, 'success');
    loadView(dash.currentView);
  } catch(e) { toast('Seed failed', 'error'); }
}
