let currentCartData = [];
let currentTotal = 0;

// Update Clock
function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').innerText = now.toLocaleString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
}
setInterval(updateClock, 1000);
updateClock();

// Fetch Products for Left Side
async function fetchProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        
        const container = document.getElementById('products-container');
        container.innerHTML = '';
        
        for (const [uid, p] of Object.entries(products)) {
            let iconClass = 'fa-box';
            if(p.item.toLowerCase().includes('milk')) iconClass = 'fa-jug-detergent';
            if(p.item.toLowerCase().includes('rice') || p.item.toLowerCase().includes('wheat') || p.item.toLowerCase().includes('oats')) iconClass = 'fa-seedling';
            if(p.item.toLowerCase().includes('mango')) iconClass = 'fa-apple-whole';
            if(p.item.toLowerCase().includes('biscuit')) iconClass = 'fa-cookie';
            
            const card = document.createElement('div');
            card.className = 'product-card';
            card.innerHTML = `
                <div class="product-icon"><i class="fa-solid ${iconClass}"></i></div>
                <div class="product-name">${p.item}</div>
                <div class="product-uid">${uid}</div>
                <div class="product-price">₹${p.price}</div>
            `;
            container.appendChild(card);
            
            // Populate select for manual add
            const selectEl = document.getElementById('manual-item-select');
            if (selectEl) {
                const option = document.createElement('option');
                option.value = uid;
                option.innerText = `${p.item} (₹${p.price}) - ${uid}`;
                selectEl.appendChild(option);
            }
        }
    } catch(e) {
        console.error("Error fetching products:", e);
    }
}
fetchProducts();

// Fetch Cart via REST polling
async function fetchCart() {
    try {
        const response = await fetch('/api/cart');
        const data = await response.json();
        
        // Check for changes to avoid unnecessary DOM updates
        if (JSON.stringify(data.items) === JSON.stringify(currentCartData)) {
            return; 
        }
        
        currentCartData = data.items;
        currentTotal = data.total;
        
        renderCart();
    } catch (error) {
        console.error('Error fetching cart:', error);
    }
}

// Poll latest checkout status
let lastSeenBillId = null;
async function checkLatestBill() {
    try {
        const response = await fetch('/api/latest_checkout');
        if (response.ok) {
            const data = await response.json();
            
            // Initialization
            if (lastSeenBillId === null && data.bill_id) {
                lastSeenBillId = data.bill_id;
                return;
            }
            
            // If a new bill was created (e.g. from Postman or UI)
            if (data.bill_id && data.bill_id !== lastSeenBillId) {
                lastSeenBillId = data.bill_id;
                window.currentBillId = data.bill_id;
                
                document.getElementById('checkout-total-display').innerText = `₹${data.total}`;
                document.getElementById('checkout-items-count').innerText = `Payment completed successfully.`;
                document.getElementById('payment-modal').classList.add('active');
                
                // Immediately refresh cart since it was cleared
                fetchCart();
            }
        }
    } catch (error) {
        console.error('Error checking latest bill:', error);
    }
}

// Render Cart in UI
function renderCart() {
    const container = document.getElementById('cart-items');
    container.innerHTML = '';
    
    const totalItemsCount = currentCartData.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('total-count').innerText = totalItemsCount;
    document.getElementById('total-price').innerText = `₹${currentTotal}`;
    
    const checkoutBtn = document.getElementById('checkout-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    if (currentCartData.length === 0) {
        checkoutBtn.disabled = true;
        clearBtn.disabled = true;
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-basket-shopping"></i>
                <p>Cart is empty</p>
                <small style="color: #94a3b8">Scan items to add them to the bill</small>
            </div>
        `;
        return;
    }
    
    checkoutBtn.disabled = false;
    clearBtn.disabled = false;

    currentCartData.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div class="cart-item-info">
                <span class="cart-item-name">${item.item}</span>
                <span class="cart-item-uid" style="margin-top: 2px;">${item.uid} | ${item.quantity} x ₹${item.price}</span>
            </div>
            <div class="cart-item-right">
                <span class="cart-item-price">₹${item.price * item.quantity}</span>
                <button class="remove-btn" onclick="removeItem(${index})" title="Remove">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        container.appendChild(itemEl);
    });
    
    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Poll every 1 second
setInterval(fetchCart, 1000);
setInterval(checkLatestBill, 1000);
fetchCart();

// Remove item
async function removeItem(index) {
    await fetch(`/api/cart/remove/${index}`, { method: 'POST' });
    fetchCart();
}

// Clear cart
async function clearCart() {
    if(confirm("Are you sure you want to clear the entire cart?")) {
        await fetch(`/api/cart/clear`, { method: 'POST' });
        fetchCart();
    }
}

// Modals
function openManualModal() {
    document.getElementById('manual-modal').classList.add('active');
}

function closeManualModal() {
    document.getElementById('manual-modal').classList.remove('active');
}

async function openCheckout() {
    const response = await fetch('/api/checkout', { method: 'POST' });
    if (!response.ok) {
        alert("Failed to checkout. Is the cart empty?");
    }
    // Note: The UI will automatically pop up the modal thanks to the checkLatestBill polling!
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.remove('active');
}

// Add Manual Item
async function submitManualItem() {
    const selectEl = document.getElementById('manual-item-select');
    const qtyEl = document.getElementById('manual-item-qty');
    const uid = selectEl.value;
    const qty = parseInt(qtyEl.value) || 1;
    
    if (!uid) {
        alert('Please select a valid item.');
        return;
    }
    
    const response = await fetch(`/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: uid, quantity: qty })
    });
    
    if (response.ok) {
        document.getElementById('manual-item-qty').value = "1";
        closeManualModal();
        fetchCart(); // Update immediately
    } else {
        alert('Failed to add item');
    }
}

// Generate PDF (Triggered by the manual button in the popup)
function generatePDF() {
    if (window.currentBillId) {
        window.location.href = `/api/bills/${window.currentBillId}/pdf`;
        closePaymentModal();
    } else {
        alert("No bill ID found to download!");
    }
}
