# Smart Billing POS System

This is a single-cart Smart Point of Sale (POS) backend and frontend designed to integrate directly with an ESP8266 or Arduino.

## System Architecture

1. **FastAPI Backend (`main.py`)**: Handles the product database, cart state, and provides REST APIs.
2. **Frontend UI (`static/index.html`)**: A clean, single-page light theme UI showing products on the left and the active bill on the right.
3. **ESP8266 Client (`esp8266_client.ino`)**: Scans RFID cards and directly sends HTTP POST requests to the FastAPI backend.

## Setup and Run

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
3. Open `http://localhost:8000/` in your browser.

---

## API Documentation

The server exposes the following REST APIs:

### 1. `GET /api/products`
Returns the dictionary of all products available in the database.
**Response (200 OK)**
```json
{
  "7297745C": {"item": "Rice 1kg", "price": 20},
  "F175D3AD": {"item": "Milk", "price": 30}
}
```

### 2. `POST /api/scan`
Add an item to the cart using its RFID UID. This is the endpoint the ESP8266 calls.
**Request Body**
```json
{
  "uid": "7297745C"
}
```
**Response (200 OK)**
```json
{
  "status": "success",
  "message": "Added Rice 1kg",
  "cart": [ ... ]
}
```

### 3. `GET /api/cart`
Returns the current items in the cart and the total price. Used by the UI for live polling.
**Response (200 OK)**
```json
{
  "items": [
    {"uid": "7297745C", "item": "Rice 1kg", "price": 20}
  ],
  "total": 20
}
```

### 4. `POST /api/cart/add_manual`
Manually add an item to the cart (without RFID).
**Request Body**
```json
{
  "item": "Custom Item",
  "price": 15
}
```

### 5. `POST /api/cart/remove/{index}`
Removes a specific item from the cart based on its array index.

### 6. `POST /api/cart/clear`
Clears all items in the current cart.
