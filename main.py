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
