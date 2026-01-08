/*
 * ESP32 OTA Update via AWS IoT + S3
 * 
 * Quy trình:
 * 1. ESP32 subscribe topic: ota/{device_id}
 * 2. Server gửi message với URL firmware
 * 3. ESP32 download và flash firmware
 * 4. ESP32 reboot với firmware mới
 * 
 * Yêu cầu:
 * - Partition scheme: "Minimal SPIFFS (1.9MB APP with OTA)"
 * - Libraries: ArduinoJson, HTTPClient, Update
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

// ============================================
// CẤU HÌNH
// ============================================
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASSWORD";

const char* MQTT_BROKER = "a4bbq76bjvnc5-ats.iot.eu-central-1.amazonaws.com";
const int MQTT_PORT = 8883;
const char* DEVICE_ID = "esp32_001";

// Firmware version hiện tại
const char* CURRENT_VERSION = "1.0.0";

// Topics
String OTA_TOPIC = String("ota/") + DEVICE_ID;
String STATUS_TOPIC = String("status/") + DEVICE_ID;

// ============================================
// BIẾN TOÀN CỤC
// ============================================
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

bool otaInProgress = false;

// ============================================
// CERTIFICATES (Thay bằng cert thật của bạn)
// ============================================
const char* ROOT_CA = R"(
-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
...
-----END CERTIFICATE-----
)";

const char* DEVICE_CERT = R"(
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
)";

const char* DEVICE_KEY = R"(
-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
)";

// ============================================
// SETUP
// ============================================
void setup() {
    Serial.begin(115200);
    Serial.println("\n=== ESP32 OTA Demo ===");
    Serial.printf("Current firmware version: %s\n", CURRENT_VERSION);
    
    // Kết nối WiFi
    connectWiFi();
    
    // Cấu hình SSL
    wifiClient.setCACert(ROOT_CA);
    wifiClient.setCertificate(DEVICE_CERT);
    wifiClient.setPrivateKey(DEVICE_KEY);
    
    // Cấu hình MQTT
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1024);
    
    // Kết nối MQTT
    connectMQTT();
    
    // Gửi thông tin boot
    sendBootInfo();
}

// ============================================
// LOOP
// ============================================
void loop() {
    if (!mqttClient.connected()) {
        connectMQTT();
    }
    mqttClient.loop();
    
    // Các task khác của bạn...
    delay(100);
}

// ============================================
// KẾT NỐI WIFI
// ============================================
void connectWiFi() {
    Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.printf("\nWiFi connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

// ============================================
// KẾT NỐI MQTT
// ============================================
void connectMQTT() {
    while (!mqttClient.connected()) {
        Serial.println("Connecting to MQTT...");
        
        if (mqttClient.connect(DEVICE_ID)) {
            Serial.println("MQTT connected!");
            
            // Subscribe OTA topic
            mqttClient.subscribe(OTA_TOPIC.c_str());
            Serial.printf("Subscribed to: %s\n", OTA_TOPIC.c_str());
        } else {
            Serial.printf("MQTT failed, rc=%d. Retry in 5s...\n", mqttClient.state());
            delay(5000);
        }
    }
}

// ============================================
// MQTT CALLBACK - NHẬN LỆNH OTA
// ============================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.printf("Message on topic: %s\n", topic);
    
    // Parse JSON
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.printf("JSON parse error: %s\n", error.c_str());
        return;
    }
    
    // Kiểm tra lệnh OTA
    const char* command = doc["command"];
    if (strcmp(command, "OTA_UPDATE") == 0) {
        const char* firmwareUrl = doc["url"];
        const char* newVersion = doc["version"];
        const char* checksum = doc["checksum"]; // MD5 optional
        
        Serial.println("=== OTA UPDATE REQUEST ===");
        Serial.printf("New version: %s\n", newVersion);
        Serial.printf("URL: %s\n", firmwareUrl);
        
        // So sánh version
        if (strcmp(newVersion, CURRENT_VERSION) == 0) {
            Serial.println("Already on latest version!");
            sendOtaStatus("SKIPPED", "Already up to date");
            return;
        }
        
        // Bắt đầu OTA
        performOTA(firmwareUrl, newVersion);
    }
}

// ============================================
// THỰC HIỆN OTA UPDATE
// ============================================
void performOTA(const char* url, const char* newVersion) {
    if (otaInProgress) {
        Serial.println("OTA already in progress!");
        return;
    }
    
    otaInProgress = true;
    sendOtaStatus("STARTED", "Beginning download...");
    
    Serial.printf("Starting OTA from: %s\n", url);
    
    HTTPClient http;
    http.begin(url);
    
    int httpCode = http.GET();
    
    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("HTTP error: %d\n", httpCode);
        sendOtaStatus("FAILED", "HTTP download failed");
        otaInProgress = false;
        return;
    }
    
    int contentLength = http.getSize();
    Serial.printf("Firmware size: %d bytes\n", contentLength);
    
    if (contentLength <= 0) {
        Serial.println("Invalid content length!");
        sendOtaStatus("FAILED", "Invalid firmware size");
        otaInProgress = false;
        return;
    }
    
    // Kiểm tra không gian
    if (!Update.begin(contentLength)) {
        Serial.println("Not enough space for OTA!");
        sendOtaStatus("FAILED", "Not enough space");
        otaInProgress = false;
        return;
    }
    
    WiFiClient* stream = http.getStreamPtr();
    
    // Download và write firmware
    sendOtaStatus("DOWNLOADING", "Writing firmware...");
    
    size_t written = Update.writeStream(*stream);
    
    if (written == contentLength) {
        Serial.printf("Written: %d bytes successfully\n", written);
    } else {
        Serial.printf("Written only %d / %d bytes!\n", written, contentLength);
        sendOtaStatus("FAILED", "Incomplete download");
        otaInProgress = false;
        return;
    }
    
    // Kết thúc update
    if (Update.end()) {
        Serial.println("OTA update finished!");
        
        if (Update.isFinished()) {
            Serial.println("Update successfully completed. Rebooting...");
            sendOtaStatus("SUCCESS", newVersion);
            delay(1000);
            ESP.restart();
        } else {
            Serial.println("Update not finished!");
            sendOtaStatus("FAILED", "Update incomplete");
        }
    } else {
        Serial.printf("Update error: %s\n", Update.errorString());
        sendOtaStatus("FAILED", Update.errorString());
    }
    
    otaInProgress = false;
}

// ============================================
// GỬI TRẠNG THÁI OTA
// ============================================
void sendOtaStatus(const char* status, const char* message) {
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["ota_status"] = status;
    doc["message"] = message;
    doc["current_version"] = CURRENT_VERSION;
    doc["timestamp"] = millis();
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    mqttClient.publish(STATUS_TOPIC.c_str(), buffer);
    Serial.printf("OTA Status: %s - %s\n", status, message);
}

// ============================================
// GỬI THÔNG TIN BOOT
// ============================================
void sendBootInfo() {
    StaticJsonDocument<256> doc;
    doc["device_id"] = DEVICE_ID;
    doc["event"] = "BOOT";
    doc["firmware_version"] = CURRENT_VERSION;
    doc["ip"] = WiFi.localIP().toString();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["timestamp"] = millis();
    
    char buffer[256];
    serializeJson(doc, buffer);
    
    mqttClient.publish(STATUS_TOPIC.c_str(), buffer);
}
