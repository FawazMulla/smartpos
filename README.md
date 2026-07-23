# SmartPOS — Intelligent Retail Ecosystem

A full-stack smart shopping cart system built with FastAPI, SQLite, and ESP8266/RFID hardware. Customers scan a cart QR code on their phone, items are scanned at the shelf via RFID, and they pay directly in the mobile app.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## System Architecture

```
[ESP8266 + RFID] ──POST /api/scan──► [FastAPI Backend]
                                            │
                  ┌─────────────────────────┤
                  ▼                         ▼
         [Customer Mobile App]    [Management Console]
         /mobile                  /
         • Scan cart QR           • Inventory CRUD
         • View live cart         • Live cart monitoring
         • Checkout & pay         • Static QR codes
```

---

## Quick Start (Local)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/smartpos.git
cd smartpos

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run
python main.py
```

Open:
- **Management Console:** http://localhost:8000
- **Customer Mobile App:** http://localhost:8000/mobile

### Default Accounts

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Customer | `customer` | `customer123` |
| Test User | `testuser` | `test1234` |

---

## Deploy to Render (One-Click)

### Option A — Deploy Button
Click the **Deploy to Render** button above. Render will read `render.yaml` and automatically:
- Create a **Web Service** running `python main.py`
- Attach a **1 GB persistent disk** at `/var/data` (so your database survives redeploys)
- Set the `DB_PATH` environment variable to `/var/data/pos.db`

### Option B — Manual Setup
1. Go to [render.com](https://render.com) and sign in.
2. Click **New → Blueprint**.
3. Connect your GitHub/GitLab repository.
4. Render detects `render.yaml` automatically — click **Apply**.
5. Wait ~2 minutes for the first deploy.
6. Your app is live at `https://smartpos-XXXX.onrender.com`.

### After Deploying
Update your ESP8266 firmware with the Render URL:
```cpp
const char* SERVER_HOST = "smartpos-xxxx.onrender.com";
const int   SERVER_PORT = 443;  // HTTPS on Render
```
> ⚠️ You'll also need to update the HTTP call to use `https://`. See [ESP8266 HTTPS guide](https://arduino-esp8266.readthedocs.io/en/latest/esp8266wifi/client-secure-examples.html) or use a local server for hardware testing.

---

## Project Structure

```
smartpos/
├── main.py                  # FastAPI backend — all API routes
├── requirements.txt         # Python dependencies
├── render.yaml              # Render deployment blueprint
├── .gitignore
├── esp8266_client.ino       # Arduino firmware for smart cart hardware
└── static/
    ├── index.html           # Management Console (POS dashboard)
    ├── style.css
    ├── script.js
    ├── mobile.html          # Customer Mobile App
    ├── mobile.css
    └── mobile.js
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Authenticate |
| GET | `/api/carts` | List all carts with status |
| POST | `/api/carts/pair` | Pair customer to cart |
| POST | `/api/carts/unpair` | Release cart |
| POST | `/api/scan` | RFID scan — add item to cart |
| GET | `/api/cart/{cart_id}` | Get cart contents + weight |
| POST | `/api/cart/{cart_id}/checkout` | Checkout and generate bill |
| GET | `/api/bills/{bill_id}/pdf` | Download PDF receipt |
| GET | `/api/products` | List all products |
| POST | `/api/inventory/products` | Add product |
| DELETE | `/api/inventory/products/{uid}` | Delete product |
| GET | `/api/inventory/summary` | Stock overview stats |

---

## Hardware Setup

See [ARDUINO_SETUP.md](ARDUINO_SETUP.md) for the full wiring guide, library installation, and multi-cart configuration.

---

## Static QR Code Rule

> **One cart = one permanent QR code. It never changes.**

Each physical cart has a `CART_ID` flashed into its firmware (e.g. `CART-101`). The QR code printed from the Management Console encodes `SMARTPOS:CART-101`. When a customer scans it, they connect to that specific cart's live session. Adding a new cart only requires flashing a new `CART_ID` — the server auto-creates it on first scan.
