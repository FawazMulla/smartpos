#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// --- WiFi Configuration ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// --- FastAPI Server Configuration ---
// Replace with your PC's IP address (e.g., "192.168.1.10")
const char* serverUrl = "http://192.168.1.100:8000/api/scan";

// --- Pin Definitions for NodeMCU ESP8266 ---
#define SS_PIN D8 // D8 (GPIO15) on NodeMCU
#define RST_PIN D3 // D3 (GPIO0) on NodeMCU

MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2); // Check your LCD address (0x27 or 0x3F)

void setup() {
  Serial.begin(9600);
  SPI.begin();
  mfrc522.PCD_Init();

  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcd.print(".");
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connected!");
  delay(1000);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Scan Item...");
}

String getUID() {
  String content = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    content += String(mfrc522.uid.uidByte[i], HEX);
  }
  content.toUpperCase();
  return content;
}

void sendUIDToServer(String uid) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;

    http.begin(client, serverUrl);
    http.addHeader("Content-Type", "application/json");

    // Create JSON payload: {"uid": "7297745C"}
    String httpRequestData = "{\"uid\": \"" + uid + "\"}";
    
    Serial.print("Sending: ");
    Serial.println(httpRequestData);

    int httpResponseCode = http.POST(httpRequestData);

    lcd.clear();
    lcd.setCursor(0, 0);
    
    if (httpResponseCode > 0) {
      if (httpResponseCode == 200) {
        lcd.print("Item Added!");
      } else if (httpResponseCode == 404) {
        lcd.print("Unknown Item!");
      } else {
        lcd.print("Error: ");
        lcd.print(httpResponseCode);
      }
    } else {
      lcd.print("Server Error!");
    }

    http.end();
  } else {
    lcd.clear();
    lcd.print("WiFi Error!");
  }
}

void loop() {
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;

  String uid = getUID();
  Serial.print("Scanned UID: ");
  Serial.println(uid);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Sending...");

  sendUIDToServer(uid);

  delay(2000); // Wait 2 seconds before next scan

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Scan Item...");

  mfrc522.PICC_HaltA();
}
