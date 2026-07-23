#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <qrcode.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Wokwi Virtual Wi-Fi (No password required)
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// Mock API endpoint for testing in Wokwi
// In real life, change this to your FastAPI server IP
const String serverURL = "http://httpbin.org/anything?session_token=CART1-SECURE-9988";

void setup() {
  Serial.begin(115200);

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 failed"));
    for(;;);
  }

  // 1. Connect to Wi-Fi
  displayMessage("Connecting Wi-Fi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected!");

  // 2. Fetch Session Token
  displayMessage("Fetching Token...");
  String token = fetchToken();

  // 3. Display QR Code
  if (token != "") {
    displayQRCode(token.c_str());
  } else {
    displayMessage("API Error");
  }
}

void loop() {}

String fetchToken() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverURL);
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      // Parse the mock JSON response
      StaticJsonDocument<1024> doc;
      deserializeJson(doc, payload);
      String token = doc["args"]["session_token"].as<String>();
      http.end();
      return token;
    }
    http.end();
  }
  return "";
}

void displayQRCode(const char* text) {
  display.clearDisplay();
  QRCode qrcode;
  uint8_t qrcodeData[qrcode_getBufferSize(3)];
  qrcode_initText(&qrcode, qrcodeData, 3, 0, text);

  int scale = 2;
  int startX = (SCREEN_WIDTH - (qrcode.size * scale)) / 2;
  int startY = (SCREEN_HEIGHT - (qrcode.size * scale)) / 2;

  for (uint8_t y = 0; y < qrcode.size; y++) {
    for (uint8_t x = 0; x < qrcode.size; x++) {
      if (qrcode_getModule(&qrcode, x, y)) {
        display.fillRect(startX + (x * scale), startY + (y * scale), scale, scale, WHITE);
      }
    }
  }
  display.display();
}

void displayMessage(String msg) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0,0);
  display.println(msg);
  display.display();
}