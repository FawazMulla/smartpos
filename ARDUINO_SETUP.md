# SmartPOS — Arduino / ESP8266 Cart Setup Guide

## What You'll Need

### Hardware (per cart)
| Part | Spec | Approx. Cost |
|---|---|---|
| **NodeMCU ESP8266** | v3 (CP2102 or CH340 USB chip) | ~$3 |
| **MFRC522 RFID Module** | 13.56 MHz, SPI | ~$2 |
| **16×2 I2C LCD** | PCF8574 backpack (0x27 or 0x3F) | ~$2 |
| **RFID Tags / Cards** | ISO 14443A | ~$0.50 each |
| **Jumper wires** | Male-to-female | ~$1 |
| **Breadboard** | Optional | ~$1 |
| **Micro-USB cable** | Data (not charge-only) | — |

---

## 1 · Install Arduino IDE

1. Download **Arduino IDE 2.x** from [arduino.cc/en/software](https://arduino.cc/en/software).
2. Install and launch it.

---

## 2 · Add ESP8266 Board Support

1. Go to **File → Preferences**.
2. In *Additional Boards Manager URLs*, paste:
   ```
   https://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
3. Click **OK**.
4. Go to **Tools → Board → Boards Manager**, search `esp8266`, and install **esp8266 by ESP8266 Community** (version 3.x).

---

## 3 · Install Required Libraries

Go to **Tools → Manage Libraries** and install:

| Library | Author | Version |
|---|---|---|
| `MFRC522` | GithubCommunity | 1.4.x |
| `LiquidCrystal_I2C` | Frank de Brabander | 1.1.x |
| `ArduinoJson` | Benoit Blanchon | 6.x or 7.x |

> **Tip:** Search the exact name shown above — there are many similarly-named forks.

---

## 4 · Wiring Diagram

### MFRC522 → NodeMCU ESP8266

```
MFRC522 Pin   NodeMCU Pin   Description
──────────────────────────────────────────
SDA (SS)   →  D8 (GPIO15)  Chip Select
SCK        →  D5 (GPIO14)  SPI Clock
MOSI       →  D7 (GPIO13)  SPI Data Out
MISO       →  D6 (GPIO12)  SPI Data In
RST        →  D3 (GPIO0)   Reset
3.3V       →  3V3           Power (3.3V only!)
GND        →  GND
```

> ⚠️ **Use 3.3V, never 5V** for the MFRC522. It will be damaged by 5V.

### 16×2 I2C LCD → NodeMCU ESP8266

```
LCD Pin   NodeMCU Pin   Description
──────────────────────────────────────────
VCC    →  Vin (5V)      Power
GND    →  GND           Ground
SDA    →  D2 (GPIO4)    I2C Data
SCL    →  D1 (GPIO5)    I2C Clock
```

> If the LCD stays blank after power-on, adjust the contrast potentiometer on the back of the I2C backpack with a small screwdriver.

---

## 5 · Find Your LCD I2C Address

Before uploading the main sketch, run an I2C scanner to find your LCD address (usually `0x27` or `0x3F`):

```cpp
#include <Wire.h>
void setup() {
  Wire.begin();
  Serial.begin(115200);
  Serial.println("Scanning I2C...");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      Serial.println(addr, HEX);
    }
  }
}
void loop() {}
```

Upload this, open Serial Monitor at **115200 baud**, and note the address. Update the `LiquidCrystal_I2C lcd(0x27, 16, 2)` line in `esp8266_client.ino` if yours is `0x3F`.

---

## 6 · Configure the Firmware

Open `esp8266_client.ino` in Arduino IDE and edit **only these lines at the top**:

```cpp
// ── WiFi ─────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";      // ← your WiFi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // ← your WiFi password

// ── Server ───────────────────────────────────
// Local development: your PC's IP on the same network
// Render deployment: your .onrender.com URL (without https://)
const char* SERVER_HOST   = "192.168.1.100";        // ← your PC/server IP
const int   SERVER_PORT   = 8000;                   // ← 8000 locally, 443 on Render

// ── Cart Identity ────────────────────────────
// IMPORTANT: flash CART-101 on the first cart, CART-102 on the second, etc.
// This value must be UNIQUE per physical cart. Never change it after setup.
const String CART_ID      = "CART-101";             // ← change per cart!
```

### Finding Your PC's Local IP

**Windows:**
```
Win + R → cmd → ipconfig
```
Look for "IPv4 Address" under your WiFi adapter, e.g. `192.168.1.105`.

**macOS / Linux:**
```
ifconfig | grep "inet "
```

> ⚠️ Your PC and the ESP8266 **must be on the same WiFi network** for local development.

---

## 7 · Select the Board & Port

1. Go to **Tools → Board → ESP8266 Boards → NodeMCU 1.0 (ESP-12E Module)**.
2. Go to **Tools → Upload Speed → 115200**.
3. Go to **Tools → Port** and select the COM port that appeared when you plugged in your ESP8266.
   - If no port appears, install the **CH340** or **CP2102** USB driver for your board variant.

---

## 8 · Upload & Test

1. Click the **Upload** button (→ arrow).
2. After upload, open **Tools → Serial Monitor** at **115200 baud**.
3. You should see:
   ```
   [OK] WiFi connected
   192.168.1.xxx
   ```
4. The LCD will display:
   ```
   WiFi Ready!
   192.168.1.xxx
   ```
   Then:
   ```
   Scan item...
   Cart: CART-101
   ```
5. Hold an RFID card/tag near the reader. You'll see:
   ```
   [RFID] Card: 7297745C
   [SCAN] Sending: {"uid":"7297745C","cart_id":"CART-101","quantity":1}
   [SCAN] HTTP 200
   ```
   And the LCD will show the item name + cart total.

---

## 9 · Setting Up Multiple Carts

Repeat steps 6–8 for each additional cart, changing **only** the `CART_ID` value:

| Physical Cart | Firmware CART_ID | QR Code Payload |
|---|---|---|
| Cart #1 | `"CART-101"` | `SMARTPOS:CART-101` |
| Cart #2 | `"CART-102"` | `SMARTPOS:CART-102` |
| Cart #3 | `"CART-103"` | `SMARTPOS:CART-103` |

> The QR code printed from the Management Console is **permanently tied to that cart_id**. The customer scans the QR, pairs with that cart ID, and sees whatever the ESP8266 on that cart adds via RFID — the QR never changes.

---

## 10 · Registering New RFID Tags (Adding Products)

1. Open **Serial Monitor** at 115200 baud.
2. Scan a new RFID tag — you'll see its UID printed, e.g.:
   ```
   [RFID] Card: B3C4D5E6
   ```
3. In the Management Console (`http://your-server/` → **Inventory** tab), click **Add Product**.
4. Enter the UID (`B3C4D5E6`), product name, price, and stock levels.
5. The tag is now recognized by the system.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| LCD blank after power | Wrong I2C address | Run I2C scanner (Step 5) |
| LCD blank, backlight on | Wrong I2C address | Adjust potentiometer on back |
| "WiFi Failed!" on LCD | Wrong SSID/password or 5GHz network | Check credentials; ESP8266 only supports 2.4 GHz |
| "Server Error!" on LCD | Wrong server IP or server not running | Check `SERVER_HOST`; verify server is running |
| "Unknown Item!" on LCD | Tag UID not in product database | Register tag in Inventory (Step 10) |
| No COM port visible | USB driver missing | Install CH340 or CP2102 driver |
| Upload fails | Board selection wrong | Verify board = NodeMCU 1.0 |
| Card not reading | Wiring issue | Double-check SDA→D8, use 3.3V not 5V |

---

## Wiring Summary

```
NodeMCU ESP8266
╔══════════════════╗
║  D1 ────────────────── LCD SCL
║  D2 ────────────────── LCD SDA
║  D3 ────────────────── RFID RST
║  D5 ────────────────── RFID SCK
║  D6 ────────────────── RFID MISO
║  D7 ────────────────── RFID MOSI
║  D8 ────────────────── RFID SDA/SS
║  3V3 ───────────────── RFID 3.3V
║  Vin (5V) ─────────── LCD VCC
║  GND ───────────────── RFID GND + LCD GND
╚══════════════════╝
```
