from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from typing import Optional
import uvicorn
import os
import sqlite3
import hashlib
from datetime import datetime
from fpdf import FPDF

# Render mounts a persistent disk at /var/data — fall back to local pos.db for dev
DB_FILE = os.environ.get('DB_PATH', 'pos.db')

app = FastAPI(title="Smart POS Ecosystem")

# DB_FILE defined above via env var

# ─── Helpers ─────────────────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

# ─── Database Init ────────────────────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Users
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Products (with stock columns)
    c.execute('''CREATE TABLE IF NOT EXISTS products (
        uid TEXT PRIMARY KEY,
        item TEXT,
        price INTEGER,
        shelf_stock INTEGER DEFAULT 50,
        warehouse_stock INTEGER DEFAULT 200
    )''')
    # Migrate: add stock columns if missing
    for col, default in [("shelf_stock", 50), ("warehouse_stock", 200)]:
        try:
            c.execute(f"ALTER TABLE products ADD COLUMN {col} INTEGER DEFAULT {default}")
        except Exception:
            pass

    # Carts (static — one QR per cart forever)
    c.execute('''CREATE TABLE IF NOT EXISTS carts (
        cart_id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT DEFAULT 'available',
        weight_g REAL DEFAULT 0,
        paired_user TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    try:
        c.execute("ALTER TABLE carts ADD COLUMN paired_user TEXT DEFAULT NULL")
    except Exception:
        pass

    # Cart items
    c.execute('''CREATE TABLE IF NOT EXISTS cart (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cart_id TEXT DEFAULT 'CART-101',
        uid TEXT,
        item TEXT,
        price INTEGER,
        quantity INTEGER
    )''')
    try:
        c.execute("ALTER TABLE cart ADD COLUMN cart_id TEXT DEFAULT 'CART-101'")
    except Exception:
        pass

    # Bills
    c.execute('''CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cart_id TEXT DEFAULT 'CART-101',
        username TEXT DEFAULT NULL,
        total INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    for col in ["cart_id TEXT DEFAULT 'CART-101'", "username TEXT DEFAULT NULL"]:
        try:
            c.execute(f"ALTER TABLE bills ADD COLUMN {col}")
        except Exception:
            pass

    # Bill items
    c.execute('''CREATE TABLE IF NOT EXISTS bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER,
        uid TEXT,
        item TEXT,
        price INTEGER,
        quantity INTEGER,
        FOREIGN KEY(bill_id) REFERENCES bills(id)
    )''')

    # ── Seed default users ────────────────────────────────────────────────────
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [
            ("admin",    hash_password("admin123"),    "admin"),
            ("customer", hash_password("customer123"), "customer"),
        ])

    # ── Seed default products ─────────────────────────────────────────────────
    c.execute("SELECT COUNT(*) FROM products")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO products (uid, item, price, shelf_stock, warehouse_stock) VALUES (?, ?, ?, ?, ?)", [
            ("7297745C", "Rice 1kg",  20, 80,  300),
            ("F175D3AD", "Milk",      30, 60,  200),
            ("1FCD1AD",  "Biscuit",   10, 120, 500),
            ("918AB7AD", "Yoghurt",   10, 40,  150),
            ("6149AAAD", "Mango",     10, 30,  100),
            ("B1A2C4AD", "Wheat 2kg", 10, 50,  180),
            ("E3DE4F6",  "Oats",      10, 45,  160),
        ])

    # ── Seed static carts ─────────────────────────────────────────────────────
    c.execute("SELECT COUNT(*) FROM carts")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO carts (cart_id, name, status, weight_g) VALUES (?, ?, ?, ?)", [
            ("CART-101", "Smart Cart #101", "available", 450.0),
            ("CART-102", "Smart Cart #102", "available", 1600.0),
        ])

    # ── Seed mock groceries for CART-102 ──────────────────────────────────────
    c.execute("SELECT COUNT(*) FROM cart WHERE cart_id='CART-102'")
    if c.fetchone()[0] == 0:
        c.executemany("INSERT INTO cart (cart_id, uid, item, price, quantity) VALUES (?, ?, ?, ?, ?)", [
            ("CART-102", "F175D3AD", "Milk",      30, 2),
            ("CART-102", "7297745C", "Rice 1kg",  20, 1),
            ("CART-102", "1FCD1AD",  "Biscuit",   10, 3),
            ("CART-102", "6149AAAD", "Mango",     10, 1),
            ("CART-102", "918AB7AD", "Yoghurt",   10, 1),
            ("CART-102", "E3DE4F6",  "Oats",      10, 1),
        ])

    conn.commit()
    conn.close()

init_db()

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    username: str
    password: str
    role: Optional[str] = "customer"

class ScanRequest(BaseModel):
    uid: str
    quantity: int = 1
    cart_id: Optional[str] = "CART-101"

class PairRequest(BaseModel):
    cart_id: str
    username: Optional[str] = None

class UnpairRequest(BaseModel):
    cart_id: str

class ProductCreate(BaseModel):
    uid: str
    item: str
    price: int
    shelf_stock: int = 50
    warehouse_stock: int = 200

# ─── Auth Endpoints ───────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(req: AuthRequest):
    username = req.username.strip()
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    
    role = (req.role or "customer").strip().lower()
    if role not in ["admin", "customer"]:
        role = "customer"

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE username=?", (username,))
    if c.fetchone():
        conn.close()
        raise HTTPException(409, "Username already taken")
    c.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
              (username, hash_password(req.password), role))
    conn.commit()
    conn.close()
    return {"status": "success", "message": "Account created", "username": username, "role": role}

@app.post("/api/auth/login")
def login(req: AuthRequest):
    username = req.username.strip()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT username, role FROM users WHERE username=? AND password=?",
              (username, hash_password(req.password)))
    user = c.fetchone()
    conn.close()
    if not user:
        raise HTTPException(401, "Invalid username or password")
    return {"status": "success", "username": user["username"], "role": user["role"]}

@app.get("/api/auth/me")
def get_user_me(username: str = Query(...)):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT username, role FROM users WHERE username=?", (username.strip(),))
    user = c.fetchone()
    conn.close()
    if not user:
        raise HTTPException(404, "User not found")
    return {"username": user["username"], "role": user["role"]}


# ─── Cart / Pairing ───────────────────────────────────────────────────────────

@app.get("/api/carts")
def get_carts():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT cart_id, name, status, weight_g, paired_user FROM carts ORDER BY cart_id")
    rows = [dict(r) for r in c.fetchall()]
    result = []
    for row in rows:
        cid = row["cart_id"]
        c.execute("SELECT uid, item, price, quantity FROM cart WHERE cart_id=?", (cid,))
        items = [dict(r) for r in c.fetchall()]
        result.append({
            **row,
            "total_items":  sum(i["quantity"] for i in items),
            "total_price":  sum(i["price"] * i["quantity"] for i in items),
            "qr_payload":   f"SMARTPOS:{cid}",           # static forever
            "qr_url":       f"/mobile?cart_id={cid}",    # static URL for QR
        })
    conn.close()
    return {"carts": result}

@app.post("/api/carts/pair")
def pair_cart(req: PairRequest):
    cid = req.cart_id.strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT cart_id, name FROM carts WHERE cart_id=?", (cid,))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, f"Cart {cid} not found")
    c.execute("UPDATE carts SET status='paired', paired_user=? WHERE cart_id=?",
              (req.username, cid))
    conn.commit()
    conn.close()
    return {"status": "success", "cart_id": cid, "cart_name": row["name"],
            "message": f"Paired with {row['name']}"}

@app.post("/api/carts/unpair")
def unpair_cart(req: UnpairRequest):
    cid = req.cart_id.strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE carts SET status='available', paired_user=NULL WHERE cart_id=?", (cid,))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Cart {cid} unpaired"}

@app.post("/api/carts/{cart_id}/seed")
def seed_cart(cart_id: str):
    cid = cart_id.upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM cart WHERE cart_id=?", (cid,))
    c.executemany("INSERT INTO cart (cart_id, uid, item, price, quantity) VALUES (?, ?, ?, ?, ?)", [
        (cid, "F175D3AD", "Milk",      30, 2),
        (cid, "7297745C", "Rice 1kg",  20, 1),
        (cid, "1FCD1AD",  "Biscuit",   10, 3),
        (cid, "6149AAAD", "Mango",     10, 1),
        (cid, "918AB7AD", "Yoghurt",   10, 1),
        (cid, "E3DE4F6",  "Oats",      10, 1),
    ])
    c.execute("UPDATE carts SET weight_g=1600.0 WHERE cart_id=?", (cid,))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Seeded mock groceries for {cid}"}

# ─── Scan (RFID / barcode — called by ESP8266) ────────────────────────────────

@app.post("/api/scan")
def scan_item(req: ScanRequest):
    uid = req.uid.strip().upper()
    cid = (req.cart_id or "CART-101").strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT item, price FROM products WHERE uid=?", (uid,))
    prod = c.fetchone()
    if not prod:
        conn.close()
        raise HTTPException(404, "Unknown Item")
    # Ensure cart exists
    c.execute("SELECT cart_id FROM carts WHERE cart_id=?", (cid,))
    if not c.fetchone():
        c.execute("INSERT INTO carts (cart_id, name, status) VALUES (?, ?, 'available')",
                  (cid, f"Smart Cart #{cid}"))
    # Upsert cart line
    c.execute("SELECT id, quantity FROM cart WHERE uid=? AND cart_id=?", (uid, cid))
    existing = c.fetchone()
    if existing:
        c.execute("UPDATE cart SET quantity=? WHERE id=?",
                  (existing["quantity"] + req.quantity, existing["id"]))
    else:
        c.execute("INSERT INTO cart (cart_id, uid, item, price, quantity) VALUES (?, ?, ?, ?, ?)",
                  (cid, uid, prod["item"], prod["price"], req.quantity))
    conn.commit()
    # Return updated cart for LCD display
    c.execute("SELECT uid, item, price, quantity FROM cart WHERE cart_id=? ORDER BY id", (cid,))
    cart = [dict(r) for r in c.fetchall()]
    cart_total = sum(i["price"] * i["quantity"] for i in cart)
    conn.close()
    return {"status": "success", "message": f"Added {req.quantity}x {prod['item']}",
            "item": prod["item"], "price": prod["price"],
            "cart_total": cart_total, "cart": cart, "cart_id": cid}

# ─── Cart Read ────────────────────────────────────────────────────────────────

def fetch_cart(cid: str):
    cid = cid.strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT name, status, weight_g, paired_user FROM carts WHERE cart_id=?", (cid,))
    info = c.fetchone()
    c.execute("SELECT uid, item, price, quantity FROM cart WHERE cart_id=? ORDER BY id", (cid,))
    items = [dict(r) for r in c.fetchall()]
    conn.close()
    total        = sum(i["price"] * i["quantity"] for i in items)
    total_items  = sum(i["quantity"] for i in items)
    weight_g     = info["weight_g"] if info else 0
    exp_weight   = total_items * 350.0
    weight_valid = (total_items == 0) or (abs(weight_g - exp_weight) < 600)
    return {
        "cart_id":    cid,
        "cart_name":  info["name"] if info else cid,
        "status":     info["status"] if info else "available",
        "paired_user": info["paired_user"] if info else None,
        "items":      items,
        "total":      total,
        "total_items": total_items,
        "weight_sensor": {
            "current_g":  weight_g,
            "expected_g": exp_weight,
            "is_valid":   weight_valid,
            "status_text": "Weight OK" if weight_valid else "Weight Mismatch",
        }
    }

@app.get("/api/cart")
def get_cart_q(cart_id: str = Query("CART-101")):
    return fetch_cart(cart_id)

@app.get("/api/cart/{cart_id}")
def get_cart_p(cart_id: str):
    return fetch_cart(cart_id)

# ─── Cart Mutations ───────────────────────────────────────────────────────────

@app.post("/api/cart/clear")
def clear_cart_q(cart_id: str = Query("CART-101")):
    return _clear(cart_id)

@app.post("/api/cart/{cart_id}/clear")
def clear_cart_p(cart_id: str):
    return _clear(cart_id)

def _clear(cart_id: str):
    conn = get_db()
    conn.execute("DELETE FROM cart WHERE cart_id=?", (cart_id.upper(),))
    conn.commit(); conn.close()
    return {"status": "success"}

@app.post("/api/cart/remove/{index}")
def remove_item_q(index: int, cart_id: str = Query("CART-101")):
    return _remove(cart_id, index)

@app.post("/api/cart/{cart_id}/remove/{index}")
def remove_item_p(cart_id: str, index: int):
    return _remove(cart_id, index)

def _remove(cart_id: str, index: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM cart WHERE cart_id=? ORDER BY id", (cart_id.upper(),))
    rows = c.fetchall()
    if 0 <= index < len(rows):
        c.execute("DELETE FROM cart WHERE id=?", (rows[index]["id"],))
        conn.commit()
    conn.close()
    return {"status": "success"}

# ─── Checkout ─────────────────────────────────────────────────────────────────

@app.post("/api/checkout")
def checkout_q(cart_id: str = Query("CART-101"), username: Optional[str] = Query(None)):
    return _checkout(cart_id, username)

@app.post("/api/cart/{cart_id}/checkout")
def checkout_p(cart_id: str, username: Optional[str] = Query(None)):
    return _checkout(cart_id, username)

def _checkout(cart_id: str, username: Optional[str]):
    cid = cart_id.upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT uid, item, price, quantity FROM cart WHERE cart_id=?", (cid,))
    items = [dict(r) for r in c.fetchall()]
    if not items:
        conn.close()
        raise HTTPException(400, "Cart is empty")
    total = sum(i["price"] * i["quantity"] for i in items)
    c.execute("INSERT INTO bills (cart_id, username, total) VALUES (?, ?, ?)", (cid, username, total))
    bill_id = c.lastrowid
    for i in items:
        c.execute("INSERT INTO bill_items (bill_id, uid, item, price, quantity) VALUES (?, ?, ?, ?, ?)",
                  (bill_id, i["uid"], i["item"], i["price"], i["quantity"]))
    c.execute("DELETE FROM cart WHERE cart_id=?", (cid,))
    c.execute("UPDATE carts SET status='available', paired_user=NULL WHERE cart_id=?", (cid,))
    conn.commit(); conn.close()
    return {"status": "success", "bill_id": bill_id, "cart_id": cid, "total": total}

@app.get("/api/latest_checkout")
def latest_checkout(cart_id: Optional[str] = None):
    conn = get_db()
    c = conn.cursor()
    if cart_id:
        c.execute("SELECT id, cart_id, total FROM bills WHERE cart_id=? ORDER BY id DESC LIMIT 1",
                  (cart_id.upper(),))
    else:
        c.execute("SELECT id, cart_id, total FROM bills ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    return dict(row) if row else {"bill_id": None}

# ─── PDF Receipt ──────────────────────────────────────────────────────────────

@app.get("/api/bills/{bill_id}/pdf")
def bill_pdf(bill_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id, cart_id, username, total, created_at FROM bills WHERE id=?", (bill_id,))
    bill = c.fetchone()
    if not bill:
        conn.close()
        raise HTTPException(404, "Bill not found")
    c.execute("SELECT uid, item, price, quantity FROM bill_items WHERE bill_id=?", (bill_id,))
    items = [dict(r) for r in c.fetchall()]
    conn.close()

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("helvetica", "B", 20)
    pdf.set_text_color(0, 60, 51)
    pdf.cell(0, 10, "Smart POS Receipt", ln=True)
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(97, 97, 97)
    cart_label = bill["cart_id"] or "CART-101"
    user_label = bill["username"] or "Guest"
    pdf.cell(0, 8, f"Bill #{bill_id}  |  Cart: {cart_label}  |  Customer: {user_label}  |  {bill['created_at']}", ln=True)
    pdf.ln(4)
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(10, 9, "#", border=1)
    pdf.cell(70, 9, "Item", border=1)
    pdf.cell(40, 9, "UID", border=1)
    pdf.cell(15, 9, "Qty", border=1)
    pdf.cell(25, 9, "Price", border=1)
    pdf.cell(30, 9, "Total", border=1, ln=True)
    pdf.set_font("helvetica", "", 10)
    for idx, item in enumerate(items):
        pdf.cell(10, 9, str(idx + 1), border=1)
        pdf.cell(70, 9, item["item"], border=1)
        pdf.cell(40, 9, item["uid"], border=1)
        pdf.cell(15, 9, str(item["quantity"]), border=1)
        pdf.cell(25, 9, f"Rs.{item['price']}", border=1)
        pdf.cell(30, 9, f"Rs.{item['price'] * item['quantity']}", border=1, ln=True)
    pdf.ln(8)
    pdf.set_font("helvetica", "B", 13)
    pdf.set_text_color(0, 60, 51)
    pdf.cell(0, 9, f"Total Paid: Rs. {bill['total']}", align="R", ln=True)
    pdf.ln(8)
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(147, 147, 159)
    pdf.cell(0, 9, "Thank you for shopping — Smart POS Ecosystem", align="C")

    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode("latin1")
    return Response(content=bytes(pdf_bytes), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="receipt_{bill_id}.pdf"'})

# ─── Products / Inventory ─────────────────────────────────────────────────────

@app.get("/api/products")
def get_products():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT uid, item, price, shelf_stock, warehouse_stock FROM products")
    rows = {r["uid"]: {"item": r["item"], "price": r["price"],
                       "shelf_stock": r["shelf_stock"], "warehouse_stock": r["warehouse_stock"]}
            for r in c.fetchall()}
    conn.close()
    return rows

@app.post("/api/inventory/products")
def add_product(p: ProductCreate):
    uid = p.uid.strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT uid FROM products WHERE uid=?", (uid,))
    if c.fetchone():
        conn.close()
        raise HTTPException(409, f"Product UID {uid} already exists")
    c.execute("INSERT INTO products (uid, item, price, shelf_stock, warehouse_stock) VALUES (?, ?, ?, ?, ?)",
              (uid, p.item.strip(), p.price, p.shelf_stock, p.warehouse_stock))
    conn.commit(); conn.close()
    return {"status": "success", "uid": uid, "item": p.item}

@app.delete("/api/inventory/products/{uid}")
def delete_product(uid: str):
    uid = uid.strip().upper()
    conn = get_db()
    c = conn.cursor()
    c.execute("DELETE FROM products WHERE uid=?", (uid,))
    conn.commit(); conn.close()
    return {"status": "success", "message": f"Deleted {uid}"}

@app.get("/api/inventory/summary")
def inventory_summary():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as cnt, SUM(shelf_stock) as shelf, SUM(warehouse_stock) as wh FROM products")
    prod = dict(c.fetchone())
    c.execute("SELECT COUNT(*) as active FROM carts WHERE status='paired'")
    active_carts = c.fetchone()["active"]
    c.execute("SELECT SUM(quantity) as in_carts FROM cart")
    in_carts = c.fetchone()["in_carts"] or 0
    c.execute("SELECT SUM(bi.quantity) as sold FROM bill_items bi")
    sold = c.fetchone()["sold"] or 0
    conn.close()
    return {
        "total_products":  prod["cnt"],
        "shelf_stock":     prod["shelf"] or 0,
        "warehouse_stock": prod["wh"] or 0,
        "active_carts":    active_carts,
        "items_in_carts":  in_carts,
        "total_sold":      sold,
    }

# ─── Static Files & Routes ────────────────────────────────────────────────────

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/manifest.json")
def get_manifest():
    return FileResponse("static/manifest.json", media_type="application/json")

@app.get("/sw.js")
def get_sw():
    return FileResponse("static/sw.js", media_type="application/javascript")

@app.get("/favicon.ico")
@app.get("/favicon.png")
def get_favicon():
    return FileResponse("static/favicon.png", media_type="image/png")

@app.get("/apple-touch-icon.png")
def get_apple_touch_icon():
    return FileResponse("static/apple-touch-icon.png", media_type="image/png")

@app.get("/icon-192.png")
def get_icon192():
    return FileResponse("static/icon-192.png", media_type="image/png")

@app.get("/icon-512.png")
def get_icon512():
    return FileResponse("static/icon-512.png", media_type="image/png")

@app.get("/mobile")
def mobile_app():
    return FileResponse("static/mobile.html")

@app.get("/")
def pos_dashboard():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    port = int(os.environ.get('PORT', 8000))
    # Disable reload in production (Render sets PORT env var)
    reload = 'PORT' not in os.environ
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload)
