/**
 * ESP32 IoT Dashboard - UI Module
 * 
 * Module này xử lý tất cả các tương tác giao diện người dùng
 */

/**
 * Thêm entry vào log
 * @param {string} message - Nội dung log
 * @param {string} type - Loại log: 'info', 'message', 'error'
 */
function addLog(message, type = 'info') {
    const logContainer = document.getElementById('log-container');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN');
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="log-${type}">${message}</span>
    `;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Giới hạn số dòng log
    while (logContainer.children.length > CONFIG.MAX_LOG_ENTRIES) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

/**
 * Cập nhật trạng thái kết nối trên giao diện
 * @param {boolean} connected - Trạng thái kết nối
 * @param {string} message - Thông điệp hiển thị
 */
function updateConnectionStatus(connected, message) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('connection-status');
    const btnConnect = document.getElementById('btn-connect');
    const btnOn = document.getElementById('btn-on');
    const btnOff = document.getElementById('btn-off');
    
    isConnected = connected;
    
    if (connected) {
        statusDot.classList.add('connected');
        statusText.textContent = message || 'Đã kết nối';
        btnConnect.textContent = '✅ Đã kết nối';
        btnConnect.disabled = true;
        btnOn.disabled = false;
        btnOff.disabled = false;
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = message || 'Chưa kết nối';
        btnConnect.textContent = '🔗 Kết nối AWS IoT';
        btnConnect.disabled = false;
        btnOn.disabled = true;
        btnOff.disabled = true;
    }
}

/**
 * Hiển thị dữ liệu cảm biến nhận được từ ESP32
 * @param {string} payload - Dữ liệu nhận được (JSON hoặc text)
 */
function displaySensorData(payload) {
    const sensorValue = document.getElementById('sensor-value');
    const dataGrid = document.getElementById('data-grid');
    
    try {
        // Thử parse JSON
        const data = JSON.parse(payload);
        
        // Hiển thị raw data
        sensorValue.innerHTML = `<pre style="text-align:left;font-size:1rem;">${JSON.stringify(data, null, 2)}</pre>`;
        
        // Nếu có các trường cụ thể, hiển thị trong grid
        if (data.temperature !== undefined || data.humidity !== undefined || data.temp !== undefined) {
            dataGrid.style.display = 'grid';
            
            if (data.temperature !== undefined || data.temp !== undefined) {
                document.getElementById('temp-value').textContent = 
                    (data.temperature || data.temp) + '°C';
            }
            
            if (data.humidity !== undefined) {
                document.getElementById('humidity-value').textContent = 
                    data.humidity + '%';
            }
            
            if (data.led !== undefined || data.LED !== undefined) {
                document.getElementById('led-status').textContent = 
                    (data.led || data.LED) ? 'BẬT' : 'TẮT';
            }
            
            document.getElementById('last-update').textContent = 
                new Date().toLocaleTimeString('vi-VN');
        }
        
    } catch (e) {
        // Không phải JSON, hiển thị raw text
        sensorValue.textContent = payload;
    }
}

/**
 * Hiển thị/ẩn thông báo cấu hình
 * @param {boolean} show - true để hiển thị, false để ẩn
 */
function toggleConfigNote(show) {
    const configNote = document.getElementById('config-note');
    if (configNote) {
        configNote.style.display = show ? 'block' : 'none';
    }
}
