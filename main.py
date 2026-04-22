from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, List
import uvicorn
import os
import sqlite3

app = FastAPI(title="Smart Billing POS")

DB_FILE = "pos.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create products table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            uid TEXT PRIMARY KEY,
            item TEXT,
            price INTEGER
        )
    ''')
    
    # Create cart table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT,
            item TEXT,
            price INTEGER,
            quantity INTEGER
        )
    ''')
    
    # Create bills table for history
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create bill_items table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bill_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER,
            uid TEXT,
            item TEXT,
            price INTEGER,
            quantity INTEGER,
            FOREIGN KEY(bill_id) REFERENCES bills(id)
        )
    ''')
    
    # Insert default products if empty
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        default_products = [
            ("7297745C", "Rice 1kg", 20),
            ("F175D3AD", "Milk", 30),
            ("1FCD1AD", "Biscuit", 10),
            ("918AB7AD", "Yoghurt", 10),
            ("6149AAAD", "Mango", 10),
            ("B1A2C4AD", "Wheat 2kg", 10),
            ("E3DE4F6", "Oats", 10),
        ]
        cursor.executemany("INSERT INTO products (uid, item, price) VALUES (?, ?, ?)", default_products)
        
    conn.commit()
    conn.close()

# Initialize Database on startup
init_db()

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

class ScanRequest(BaseModel):
    uid: str
    quantity: int = 1

@app.post("/api/scan")
def handle_scan(request: ScanRequest):
    uid = request.uid.upper()

    conn = get_db()
    cursor = conn.cursor()
    
    # Check if product exists
    cursor.execute("SELECT item, price FROM products WHERE uid = ?", (uid,))
    product = cursor.fetchone()
    
    if not product:
        conn.close()
        raise HTTPException(status_code=404, detail="Unknown Item")

    # Check if item is already in cart
    cursor.execute("SELECT id, quantity FROM cart WHERE uid = ?", (uid,))
    cart_item = cursor.fetchone()
    
    if cart_item:
        new_quantity = cart_item["quantity"] + request.quantity
        cursor.execute("UPDATE cart SET quantity = ? WHERE id = ?", (new_quantity, cart_item["id"]))
    else:
        cursor.execute("INSERT INTO cart (uid, item, price, quantity) VALUES (?, ?, ?, ?)", 
                       (uid, product["item"], product["price"], request.quantity))
                       
    conn.commit()
    
    # Fetch updated cart
    cursor.execute("SELECT uid, item, price, quantity FROM cart ORDER BY id ASC")
    cart = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"status": "success", "message": f"Added {request.quantity}x {product['item']}", "cart": cart}

@app.get("/api/cart")
def get_cart():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT uid, item, price, quantity FROM cart ORDER BY id ASC")
    cart = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    total = sum(item["price"] * item["quantity"] for item in cart)
    return {
        "items": cart,
        "total": total
    }

from datetime import datetime
from fpdf import FPDF
from fastapi.responses import Response

@app.post("/api/checkout")
def checkout():
    conn = get_db()
    cursor = conn.cursor()
    
    # Get current cart total and items
    cursor.execute("SELECT uid, item, price, quantity FROM cart")
    cart_items = [dict(row) for row in cursor.fetchall()]
    
    if not cart_items:
        conn.close()
        raise HTTPException(status_code=400, detail="Cart is empty")
        
    total = sum(item["price"] * item["quantity"] for item in cart_items)
    
    # Insert bill record
    cursor.execute("INSERT INTO bills (total) VALUES (?)", (total,))
    bill_id = cursor.lastrowid
    
    # Insert bill items
    for item in cart_items:
        cursor.execute("INSERT INTO bill_items (bill_id, uid, item, price, quantity) VALUES (?, ?, ?, ?, ?)",
                       (bill_id, item['uid'], item['item'], item['price'], item['quantity']))
                       
    # Clear cart
    cursor.execute("DELETE FROM cart")
    conn.commit()
    conn.close()
    
    return {
        "status": "success", 
        "message": "Bill created successfully", 
        "bill_id": bill_id, 
        "total": total
    }

@app.get("/api/latest_checkout")
def get_latest_checkout():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, total FROM bills ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"bill_id": row["id"], "total": row["total"]}
    return {"bill_id": None}

@app.get("/api/bills/{bill_id}/pdf")
def get_bill_pdf(bill_id: int):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, total, created_at FROM bills WHERE id = ?", (bill_id,))
    bill = cursor.fetchone()
    if not bill:
        conn.close()
        raise HTTPException(status_code=404, detail="Bill not found")
        
    cursor.execute("SELECT uid, item, price, quantity FROM bill_items WHERE bill_id = ?", (bill_id,))
    cart_items = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    # Generate PDF
    pdf = FPDF()
    pdf.add_page()
    
    # Header
    pdf.set_font("helvetica", "B", 24)
    pdf.set_text_color(14, 165, 233)
    pdf.cell(0, 10, "Smart POS Bill", new_x="LMARGIN", new_y="NEXT")
    
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, f"Bill #{bill_id}  |  Date: {bill['created_at']}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    
    # Table Header
    pdf.set_font("helvetica", "B", 10)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(10, 10, "#", border=1)
    pdf.cell(70, 10, "Item Description", border=1)
    pdf.cell(40, 10, "Item ID", border=1)
    pdf.cell(15, 10, "Qty", border=1)
    pdf.cell(25, 10, "Price", border=1)
    pdf.cell(30, 10, "Total", border=1, new_x="LMARGIN", new_y="NEXT")
    
    # Table Rows
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(50, 50, 50)
    for idx, item in enumerate(cart_items):
        pdf.cell(10, 10, str(idx + 1), border=1)
        pdf.cell(70, 10, item["item"], border=1)
        pdf.cell(40, 10, item["uid"], border=1)
        pdf.cell(15, 10, str(item["quantity"]), border=1)
        pdf.cell(25, 10, f"Rs. {item['price']}", border=1)
        pdf.cell(30, 10, f"Rs. {item['price'] * item['quantity']}", border=1, new_x="LMARGIN", new_y="NEXT")
        
    pdf.ln(10)
    
    # Total
    pdf.set_font("helvetica", "B", 14)
    pdf.set_text_color(30, 41, 59)
    pdf.cell(0, 10, f"Total Amount Paid: Rs. {bill['total']}", align="R", new_x="LMARGIN", new_y="NEXT")
    
    # Footer
    pdf.ln(10)
    pdf.set_font("helvetica", "", 10)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 10, "Thank you for your purchase!", align="C")
    
    pdf_bytes = pdf.output()
    if type(pdf_bytes) is str: # fpdf legacy support
        pdf_bytes = pdf_bytes.encode("latin1")
        
    headers = {
        'Content-Disposition': f'attachment; filename="Receipt_Bill_{bill_id}.pdf"'
    }
    return Response(content=bytes(pdf_bytes), media_type="application/pdf", headers=headers)

@app.post("/api/cart/clear")
def clear_cart():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cart")
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.post("/api/cart/remove/{index}")
def remove_item(index: int):
    # Find item by its array index position
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM cart ORDER BY id ASC")
    rows = cursor.fetchall()
    
    if 0 <= index < len(rows):
        item_id = rows[index]["id"]
        cursor.execute("DELETE FROM cart WHERE id = ?", (item_id,))
        conn.commit()
        
    conn.close()
    return {"status": "success"}

@app.get("/api/products")
def get_products():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT uid, item, price FROM products")
    products = {row["uid"]: {"item": row["item"], "price": row["price"]} for row in cursor.fetchall()}
    conn.close()
    return products

# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
