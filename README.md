# Smart Billing POS System

This is a complete Smart Point of Sale (POS) backend and frontend designed to integrate directly with an ESP8266 or Arduino, featuring an SQLite3 database and a clean, single-page UI.

## System Architecture

1. **FastAPI Backend (`main.py`)**: Powered by an **SQLite3 database** (`pos.db`) that persistently stores the product catalog and the current billing cart state. Exposes clean REST APIs.
2. **Frontend UI (`static/index.html`)**: A clean, single-page light theme UI showing products on the left and the active bill on the right. Automatically updates the total math (quantity x price in Rupees ₹).
3. **ESP8266 Client (`esp8266_client.ino`)**: Scans RFID cards and directly sends HTTP POST requests over Wi-Fi to the FastAPI backend.

## Setup and Run

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Start the server (this will automatically generate the `pos.db` SQLite database if it doesn't exist):
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
3. Open `http://127.0.0.1:8000/` in your browser.

---

## API Documentation

The server exposes the following REST APIs:

### 1. `GET /api/products`
Returns the dictionary of all products available in the SQLite database.
**Response (200 OK)**
```json
{
  "7297745C": {"item": "Rice 1kg", "price": 20},
  "F175D3AD": {"item": "Milk", "price": 30}
}
```

### 2. `POST /api/scan`
Add an item to the cart using its RFID UID. This is the endpoint the ESP8266 calls, and is also used by the frontend for "Manual Adds".
**Request Body**
```json
{
  "uid": "7297745C",
  "quantity": 1
}
```
*(Note: `quantity` is optional and defaults to `1` if omitted, which is perfect for the ESP8266)*
**Response (200 OK)**
```json
{
  "status": "success",
  "message": "Added 1x Rice 1kg",
  "cart": [ ... ]
}
```

### 3. `GET /api/cart`
Returns the current items in the cart (grouped by quantity) and the total price. Used by the UI for live polling.
**Response (200 OK)**
```json
{
  "items": [
    {"uid": "7297745C", "item": "Rice 1kg", "price": 20, "quantity": 3}
  ],
  "total": 60
}
```

### 4. `POST /api/cart/remove/{index}`
Removes a specific item from the cart based on its array index position on the screen.

### 5. `POST /api/cart/clear`
Clears all items in the current cart (typically called after checkout to reset the bill).
