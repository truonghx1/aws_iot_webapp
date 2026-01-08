/**
 * ESP32 IoT Dashboard - Configuration
 * 
 * ⚠️ QUAN TRỌNG: Thay đổi các giá trị này theo cấu hình AWS của bạn!
 */

const CONFIG = {
    // ============================================
    // AWS REGION
    // Region nơi bạn tạo các service AWS
    // ============================================
    AWS_REGION: 'eu-central-1',
    
    // ============================================
    // IOT ENDPOINT
    // Lấy từ: AWS IoT Console > Settings > Device data endpoint
    // ============================================
    IOT_ENDPOINT: 'a4bbq76bjvnc5-ats.iot.eu-central-1.amazonaws.com',
    
    // ============================================
    // COGNITO IDENTITY POOL ID
    // ⚠️ QUAN TRỌNG: Thay bằng Identity Pool ID thật của bạn!
    // Lấy từ: AWS Cognito Console > Identity pools > [Pool của bạn]
    // Định dạng: eu-central-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // ============================================
    IDENTITY_POOL_ID: 'eu-central-1:9fa5bad6-8226-499a-a7af-31b07defa243',
    
    // ============================================
    // MQTT TOPICS
    // Các topic để giao tiếp với ESP32
    // ============================================
    TOPIC_SUBSCRIBE: 'test_topic/esp32',  // Nhận dữ liệu từ ESP32
    TOPIC_PUBLISH: 'cmd/esp32',            // Gửi lệnh tới ESP32
    
    // ============================================
    // UI SETTINGS
    // Cấu hình giao diện
    // ============================================
    MAX_LOG_ENTRIES: 50,                   // Số dòng log tối đa
    RECONNECT_DELAY: 5000,                 // Thời gian chờ reconnect (ms)
    CONNECTION_TIMEOUT: 30000              // Timeout kết nối (ms)
};

// Freeze config để không bị thay đổi
Object.freeze(CONFIG);
