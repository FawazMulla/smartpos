from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, List
import uvicorn
import os

app = FastAPI(title="Smart Billing POS")

# Product Database based on Arduino code
PRODUCTS = {
    "7297745C": {"item": "Rice 1kg", "price": 20},
    "F175D3AD": {"item": "Milk", "price": 30},
    "1FCD1AD": {"item": "Biscuit", "price": 10},
    "918AB7AD": {"item": "Yoghurt", "price": 10},
    "6149AAAD": {"item": "Mango", "price": 10},
    "B1A2C4AD": {"item": "Wheat 2kg", "price": 10},
    "E3DE4F6": {"item": "Oats", "price": 10},
}

# Single active cart for the billing system
cart: List[Dict] = []

class ScanRequest(BaseModel):
    uid: str
    quantity: int = 1

class ManualItem(BaseModel):
    item: str
    price: int

@app.post("/api/scan")
def handle_scan(request: ScanRequest):
    uid = request.uid.upper()

    if uid not in PRODUCTS:
        raise HTTPException(status_code=404, detail="Unknown Item")

    product = PRODUCTS[uid]
    
    found = False
    for item in cart:
        if item["uid"] == uid:
            item["quantity"] += request.quantity
            found = True
            break
            
    if not found:
        cart.append({
            "uid": uid,
            "item": product["item"],
            "price": product["price"],
            "quantity": request.quantity
        })
    
    return {"status": "success", "message": f"Added {request.quantity}x {product['item']}", "cart": cart}

@app.get("/api/cart")
def get_cart():
    total = sum(item["price"] * item["quantity"] for item in cart)
    return {
        "items": cart,
        "total": total
    }

@app.post("/api/cart/add_manual")
def add_manual(item: ManualItem):
    cart.append({
        "uid": "MANUAL",
        "item": item.item,
        "price": item.price
    })
    return {"status": "success", "cart": cart}

@app.post("/api/cart/clear")
def clear_cart():
    cart.clear()
    return {"status": "success"}

@app.post("/api/cart/remove/{index}")
def remove_item(index: int):
    if 0 <= index < len(cart):
        cart.pop(index)
    return {"status": "success"}

@app.get("/api/products")
def get_products():
    return PRODUCTS

# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
