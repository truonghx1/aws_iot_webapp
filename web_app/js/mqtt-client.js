/**
 * ESP32 IoT Dashboard - MQTT Client Module
 * 
 * Module này xử lý kết nối MQTT tới AWS IoT Core
 */

// Biến toàn cục
let mqttClient = null;
let isConnected = false;

/**
 * Kết nối tới AWS IoT Core thông qua Cognito
 */
async function connectToAWS() {
    // Kiểm tra đã cấu hình chưa
    if (CONFIG.IDENTITY_POOL_ID === 'THAY_IDENTITY_POOL_ID_CUA_BAN_VAO_DAY') {
        addLog('❌ Chưa cấu hình IDENTITY_POOL_ID! Xem hướng dẫn.', 'error');
        alert('Bạn chưa cấu hình Identity Pool ID!\n\nHãy mở file js/config.js và thay thế IDENTITY_POOL_ID bằng ID thật từ AWS Cognito.');
        return;
    }
    
    addLog('🔄 Đang lấy credentials từ Cognito...', 'info');
    updateConnectionStatus(false, 'Đang kết nối...');
    
    try {
        // Cấu hình AWS SDK
        AWS.config.region = CONFIG.AWS_REGION;
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: CONFIG.IDENTITY_POOL_ID
        });
        
        // Lấy credentials từ Cognito
        await new Promise((resolve, reject) => {
            AWS.config.credentials.get((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        addLog('✅ Đã lấy credentials thành công!', 'message');
        addLog('🔄 Đang tạo kết nối WebSocket...', 'info');
        
        // Tạo signed URL cho WebSocket
        const credentials = AWS.config.credentials;
        const signedUrl = createSignedUrl({
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken
        });
        
        // Tạo client ID ngẫu nhiên
        const clientId = 'webapp-' + Math.random().toString(16).substring(2, 10);
        
        // Kết nối MQTT qua WebSocket
        mqttClient = mqtt.connect(signedUrl, {
            clientId: clientId,
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 0,  // Không tự reconnect
            connectTimeout: CONFIG.CONNECTION_TIMEOUT
        });
        
        // Đăng ký các event handlers
        setupMqttEventHandlers();
        
    } catch (error) {
        addLog('❌ Lỗi: ' + error.message, 'error');
        updateConnectionStatus(false, 'Lỗi kết nối');
        console.error('Connection error:', error);
    }
}

/**
 * Đăng ký các event handlers cho MQTT client
 */
function setupMqttEventHandlers() {
    // Kết nối thành công
    mqttClient.on('connect', function() {
        addLog('✅ Đã kết nối AWS IoT thành công!', 'message');
        updateConnectionStatus(true, 'Đã kết nối AWS IoT');
        
        // Subscribe topic
        mqttClient.subscribe(CONFIG.TOPIC_SUBSCRIBE, { qos: 0 }, function(err) {
            if (err) {
                addLog('❌ Lỗi subscribe: ' + err.message, 'error');
            } else {
                addLog(`📡 Đã subscribe topic: ${CONFIG.TOPIC_SUBSCRIBE}`, 'message');
            }
        });
        
        // Ẩn thông báo cấu hình
        toggleConfigNote(false);
    });
    
    // Nhận tin nhắn
    mqttClient.on('message', function(topic, message) {
        const payload = message.toString();
        addLog(`📨 Nhận từ [${topic}]: ${payload}`, 'message');
        
        // Hiển thị dữ liệu lên giao diện
        displaySensorData(payload);
    });
    
    // Xử lý lỗi
    mqttClient.on('error', function(error) {
        addLog('❌ Lỗi MQTT: ' + error.message, 'error');
        updateConnectionStatus(false, 'Lỗi kết nối');
    });
    
    // Ngắt kết nối
    mqttClient.on('close', function() {
        addLog('🔌 Đã ngắt kết nối', 'info');
        updateConnectionStatus(false, 'Đã ngắt kết nối');
    });
    
    // Mất kết nối
    mqttClient.on('offline', function() {
        addLog('📴 Mất kết nối (offline)', 'error');
        updateConnectionStatus(false, 'Offline');
    });
}

/**
 * Gửi lệnh tới ESP32
 * @param {string} command - Lệnh cần gửi (VD: 'LED_ON', 'LED_OFF')
 */
function sendCommand(command) {
    if (!mqttClient || !isConnected) {
        addLog('❌ Chưa kết nối! Hãy kết nối trước.', 'error');
        return;
    }
    
    const message = JSON.stringify({ 
        command: command,
        timestamp: Date.now()
    });
    
    mqttClient.publish(CONFIG.TOPIC_PUBLISH, message, { qos: 0 }, function(err) {
        if (err) {
            addLog(`❌ Lỗi gửi lệnh: ${err.message}`, 'error');
        } else {
            addLog(`📤 Đã gửi lệnh: ${command} → ${CONFIG.TOPIC_PUBLISH}`, 'message');
        }
    });
}

/**
 * Ngắt kết nối MQTT
 */
function disconnect() {
    if (mqttClient) {
        mqttClient.end();
        mqttClient = null;
        addLog('🔌 Đã ngắt kết nối', 'info');
        updateConnectionStatus(false, 'Đã ngắt kết nối');
    }
}
