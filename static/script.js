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

function openCheckout() {
    const totalItemsCount = currentCartData.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('checkout-total-display').innerText = `₹${currentTotal}`;
    document.getElementById('checkout-items-count').innerText = `Payment completed successfully for ${totalItemsCount} items.`;
    document.getElementById('payment-modal').classList.add('active');
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

// Generate PDF
async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(24);
    doc.setTextColor(14, 165, 233); // Primary color matching theme
    doc.text("Smart POS Bill", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${new Date().toLocaleString()}`, 14, 28);
    
    // Items Table
    const tableColumn = ["#", "Item Description", "Item ID", "Qty", "Price", "Total"];
    const tableRows = [];
    
    currentCartData.forEach((item, index) => {
        tableRows.push([
            index + 1,
            item.item,
            item.uid,
            item.quantity,
            `Rs. ${item.price}`,
            `Rs. ${item.price * item.quantity}`
        ]);
    });
    
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: [248, 250, 252], textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
        bodyStyles: { textColor: [50, 50, 50] },
        styles: { font: 'helvetica', fontSize: 10 },
        margin: { top: 35 }
    });
    
    // Total and Footer positioning
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let finalY = doc.lastAutoTable.finalY || 35;
    
    // Check if there is enough space for the total at the bottom
    if (finalY > pageHeight - 40) {
        doc.addPage();
    }
    
    // Structured total at the bottom right
    const bottomY = pageHeight - 35;
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    
    const totalText = `Total Amount Paid: Rs. ${currentTotal}`;
    const textWidth = doc.getTextWidth(totalText);
    
    // Right aligned (pageWidth - textWidth - right margin 14)
    doc.text(totalText, pageWidth - textWidth - 14, bottomY);
    
    // Line separator above total
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - textWidth - 20, bottomY - 8, pageWidth - 14, bottomY - 8);
    
    // Footer message at the very bottom
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text("Thank you for your purchase!", pageWidth / 2, pageHeight - 15, null, null, "center");
    
    // Save
    doc.save(`Receipt_${Date.now()}.pdf`);
    
    // Clear the cart on backend after printing
    await fetch(`/api/cart/clear`, { method: 'POST' });
    closePaymentModal();
    fetchCart();
}
