/**
 * ESP32 IoT Dashboard - AWS Signature V4 for MQTT WebSocket
 * 
 * Module này xử lý việc ký (signing) URL WebSocket để kết nối AWS IoT
 * sử dụng AWS Signature Version 4.
 */

/**
 * Tạo signing key cho AWS Signature V4
 * @param {string} key - Secret Access Key
 * @param {string} dateStamp - Ngày (YYYYMMDD)
 * @param {string} regionName - AWS Region
 * @param {string} serviceName - Tên service (iotdevicegateway)
 * @returns {Buffer} - Signing key
 */
function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = AWS.util.crypto.hmac('AWS4' + key, dateStamp, 'buffer');
    const kRegion = AWS.util.crypto.hmac(kDate, regionName, 'buffer');
    const kService = AWS.util.crypto.hmac(kRegion, serviceName, 'buffer');
    const kSigning = AWS.util.crypto.hmac(kService, 'aws4_request', 'buffer');
    return kSigning;
}

/**
 * Tạo Signed URL cho MQTT over WebSocket
 * URL này được ký bằng AWS Signature V4 để xác thực với AWS IoT
 * 
 * @param {Object} credentials - AWS credentials từ Cognito
 * @param {string} credentials.accessKeyId - Access Key ID
 * @param {string} credentials.secretAccessKey - Secret Access Key
 * @param {string} credentials.sessionToken - Session Token (optional)
 * @returns {string} - Signed WebSocket URL
 */
function createSignedUrl(credentials) {
    const time = new Date();
    const dateStamp = time.toISOString().slice(0, 10).replace(/-/g, '');
    const amzdate = dateStamp + 'T' + time.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';
    
    const service = 'iotdevicegateway';
    const region = CONFIG.AWS_REGION;
    const algorithm = 'AWS4-HMAC-SHA256';
    const method = 'GET';
    const canonicalUri = '/mqtt';
    const host = CONFIG.IOT_ENDPOINT;
    
    // Credential scope
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    
    // Canonical query string
    let canonicalQuerystring = `X-Amz-Algorithm=${algorithm}`;
    canonicalQuerystring += `&X-Amz-Credential=${encodeURIComponent(credentials.accessKeyId + '/' + credentialScope)}`;
    canonicalQuerystring += `&X-Amz-Date=${amzdate}`;
    canonicalQuerystring += `&X-Amz-SignedHeaders=host`;
    
    // Canonical headers
    const canonicalHeaders = `host:${host}\n`;
    
    // Payload hash (empty for WebSocket)
    const payloadHash = AWS.util.crypto.sha256('', 'hex');
    
    // Canonical request
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\nhost\n${payloadHash}`;
    
    // String to sign
    const stringToSign = `${algorithm}\n${amzdate}\n${credentialScope}\n${AWS.util.crypto.sha256(canonicalRequest, 'hex')}`;
    
    // Calculate signature
    const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
    const signature = AWS.util.crypto.hmac(signingKey, stringToSign, 'hex');
    
    // Add signature to query string
    canonicalQuerystring += `&X-Amz-Signature=${signature}`;
    
    // Add session token if present (required for Cognito credentials)
    if (credentials.sessionToken) {
        canonicalQuerystring += `&X-Amz-Security-Token=${encodeURIComponent(credentials.sessionToken)}`;
    }
    
    // Return complete WebSocket URL
    return `wss://${host}${canonicalUri}?${canonicalQuerystring}`;
}
