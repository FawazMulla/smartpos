/*
 * SmartPOS — ESP8266 RFID Cart Client
 * ─────────────────────────────────────
 * Hardware: NodeMCU ESP8266 + MFRC522 RFID + 16×2 I2C LCD
 * Each physical cart has ONE permanent CART_ID flashed into it.
 * The same cart will always send the same cart_id, ensuring the
 * "one cart → one static QR" relationship is maintained end-to-end.
 *
 * Wiring (NodeMCU):
 *   MFRC522 SDA  → D8 (GPIO15)
 *   MFRC522 SCK  → D5 (GPIO14)
 *   MFRC522 MOSI → D7 (GPIO13)
 *   MFRC522 MISO → D6 (GPIO12)
 *   MFRC522 RST  → D3 (GPIO0)
 *   MFRC522 3.3V → 3V3
 *   LCD SDA      → D2 (GPIO4)
 *   LCD SCL      → D1 (GPIO5)
 *   LCD VCC      → 5V, GND → GND
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>     // Install: "ArduinoJson" by Benoit Blanchon
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ─── ⚙ CONFIGURATION — edit these values ────────────────────────────────────

// WiFi
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server — your PC's local IP running the SmartPOS backend
const char* SERVER_HOST   = "192.168.1.100";
const int   SERVER_PORT   = 8000;

// *** CART IDENTITY — flash a DIFFERENT value on each physical cart ***
// CART-101 is the default. Change to CART-102 for the second cart, etc.
const String CART_ID      = "CART-101";

// ─── Pin Definitions ─────────────────────────────────────────────────────────
#define SS_PIN  D8   // GPIO15
#define RST_PIN D3   // GPIO0

// ─── Objects ─────────────────────────────────────────────────────────────────
MFRC522         rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);  // Try 0x3F if display is blank

// ─── Helpers ─────────────────────────────────────────────────────────────────
String buildScanURL() {
  return String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/scan";
}

void lcdMsg(const char* line1, const char* line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1);
  if (strlen(line2) > 0) {
    lcd.setCursor(0, 1);
    lcd.print(line2);
  }
}

// Print a string truncated to 16 chars (LCD width)
void lcdPrint16(const char* str) {
  char buf[17];
  strncpy(buf, str, 16);
  buf[16] = '\0';
  lcd.print(buf);
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();

  lcd.init();
  lcd.backlight();
  lcdMsg("SmartPOS", ("Cart: " + CART_ID).c_str());
  delay(1200);

  // Connect to WiFi
  lcdMsg("Connecting WiFi", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[OK] WiFi connected");
    Serial.println(WiFi.localIP());
    lcdMsg("WiFi Ready!", WiFi.localIP().toString().c_str());
    delay(1500);
  } else {
    Serial.println("\n[ERR] WiFi failed — running offline");
    lcdMsg("WiFi Failed!", "Offline mode");
    delay(2000);
  }

  lcdMsg("Scan item...", ("Cart: " + CART_ID).c_str());
}

// ─── UID Extraction ───────────────────────────────────────────────────────────
String getUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

// ─── HTTP POST to /api/scan ────────────────────────────────────────────────────
void sendScan(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    lcdMsg("No WiFi!", "Check network");
    delay(2000);
    lcdMsg("Scan item...", ("Cart: " + CART_ID).c_str());
    return;
  }

  WiFiClient client;
  HTTPClient http;

  String url = buildScanURL();
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  // JSON payload: {"uid": "7297745C", "cart_id": "CART-101", "quantity": 1}
  StaticJsonDocument<128> doc;
  doc["uid"]      = uid;
  doc["cart_id"]  = CART_ID;
  doc["quantity"] = 1;
  String payload;
  serializeJson(doc, payload);

  Serial.print("[SCAN] Sending: ");
  Serial.println(payload);

  int code = http.POST(payload);

  if (code > 0) {
    Serial.print("[SCAN] HTTP ");
    Serial.println(code);

    if (code == 200) {
      String body = http.getString();
      Serial.println(body);

      // Parse response to show item name and cart total on LCD
      StaticJsonDocument<512> resp;
      DeserializationError err = deserializeJson(resp, body);
      if (!err) {
        String itemName  = resp["item"]       | "Added";
        int    cartTotal = resp["cart_total"] | 0;
        String line1     = itemName.substring(0, 16);
        String line2     = "Total: Rs." + String(cartTotal);
        lcdMsg(line1.c_str(), line2.c_str());
      } else {
        lcdMsg("Item Added!", uid.c_str());
      }

    } else if (code == 404) {
      lcdMsg("Unknown Item!", uid.c_str());
    } else {
      String errMsg = "HTTP " + String(code);
      lcdMsg("Scan Error!", errMsg.c_str());
    }
  } else {
    Serial.print("[ERR] HTTP error: ");
    Serial.println(http.errorToString(code));
    lcdMsg("Server Error!", "Check backend");
  }

  http.end();
  delay(2500);
  lcdMsg("Scan item...", ("Cart: " + CART_ID).c_str());
}

// ─── Main Loop ────────────────────────────────────────────────────────────────
void loop() {
  // Check for a new RFID card
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial())   return;

  String uid = getUID();
  Serial.print("[RFID] Card: ");
  Serial.println(uid);

  lcdMsg("Reading...", uid.c_str());
  delay(200);

  sendScan(uid);

  // Halt and stop encryption to allow next scan
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
