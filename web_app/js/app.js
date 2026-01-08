/**
 * ESP32 IoT Dashboard - Main Application
 * 
 * File này khởi tạo ứng dụng và xử lý các sự kiện chính
 */

/**
 * Khởi tạo ứng dụng khi trang được load
 */
function initApp() {
    addLog('🚀 Dashboard đã sẵn sàng!', 'info');
    addLog('👉 Click "Kết nối AWS IoT" để bắt đầu', 'info');
    
    // Kiểm tra cấu hình
    if (CONFIG.IDENTITY_POOL_ID === 'THAY_IDENTITY_POOL_ID_CUA_BAN_VAO_DAY') {
        addLog('⚠️ Chưa cấu hình IDENTITY_POOL_ID!', 'error');
        toggleConfigNote(true);
    } else {
        toggleConfigNote(false);
    }
    
    // Log thông tin cấu hình (ẩn sensitive data)
    console.log('ESP32 IoT Dashboard initialized');
    console.log('Region:', CONFIG.AWS_REGION);
    console.log('IoT Endpoint:', CONFIG.IOT_ENDPOINT);
    console.log('Subscribe Topic:', CONFIG.TOPIC_SUBSCRIBE);
    console.log('Publish Topic:', CONFIG.TOPIC_PUBLISH);
}

/**
 * Xử lý khi đóng trang
 */
function cleanup() {
    if (mqttClient) {
        mqttClient.end();
    }
}

// Event Listeners
window.onload = initApp;
window.onbeforeunload = cleanup;
