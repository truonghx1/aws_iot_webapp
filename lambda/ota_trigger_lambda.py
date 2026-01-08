"""
AWS Lambda Function - Trigger OTA Update for ESP32

Cách sử dụng:
1. Upload firmware.bin lên S3
2. Gọi API này với device_id và firmware info
3. Lambda sẽ publish lệnh OTA tới device qua MQTT

Endpoints:
- POST /ota/trigger
  Body: {
      "device_id": "esp32_001",
      "version": "1.1.0",
      "firmware_key": "firmware/v1.1.0/firmware.bin"
  }

- GET /ota/status?device_id=esp32_001
"""

import json
import boto3
from datetime import datetime, timedelta

# ============================================
# CẤU HÌNH
# ============================================
IOT_REGION = 'eu-central-1'
S3_BUCKET = 'your-firmware-bucket'  # Thay bằng bucket của bạn
S3_PRESIGNED_EXPIRY = 3600  # URL hết hạn sau 1 giờ

# Clients
iot_client = boto3.client('iot-data', region_name=IOT_REGION)
s3_client = boto3.client('s3', region_name=IOT_REGION)


def lambda_handler(event, context):
    """Main Lambda handler"""
    print(f"Event: {json.dumps(event)}")
    
    try:
        path = event.get('path', '/')
        method = event.get('httpMethod', 'GET')
        
        if path == '/ota/trigger' and method == 'POST':
            return trigger_ota(event)
        elif path == '/ota/status' and method == 'GET':
            return get_ota_status(event)
        else:
            return response(404, {
                'error': 'Not Found',
                'endpoints': [
                    'POST /ota/trigger',
                    'GET /ota/status?device_id=xxx'
                ]
            })
            
    except Exception as e:
        print(f"Error: {str(e)}")
        return response(500, {'error': str(e)})


def trigger_ota(event):
    """
    Gửi lệnh OTA tới device
    
    POST /ota/trigger
    Body: {
        "device_id": "esp32_001",
        "version": "1.1.0",
        "firmware_key": "firmware/v1.1.0/firmware.bin",
        "checksum": "abc123..."  (optional)
    }
    """
    try:
        body = json.loads(event.get('body', '{}'))
    except:
        return response(400, {'error': 'Invalid JSON body'})
    
    # Validate required fields
    required = ['device_id', 'version', 'firmware_key']
    for field in required:
        if field not in body:
            return response(400, {'error': f'Missing field: {field}'})
    
    device_id = body['device_id']
    version = body['version']
    firmware_key = body['firmware_key']
    checksum = body.get('checksum', '')
    
    # Tạo pre-signed URL cho firmware
    try:
        firmware_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': firmware_key
            },
            ExpiresIn=S3_PRESIGNED_EXPIRY
        )
    except Exception as e:
        return response(500, {
            'error': 'Failed to generate firmware URL',
            'details': str(e)
        })
    
    # Tạo OTA command
    ota_command = {
        'command': 'OTA_UPDATE',
        'version': version,
        'url': firmware_url,
        'checksum': checksum,
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Publish tới device topic
    ota_topic = f'ota/{device_id}'
    
    try:
        iot_client.publish(
            topic=ota_topic,
            qos=1,  # QoS 1 để đảm bảo delivery
            payload=json.dumps(ota_command)
        )
    except Exception as e:
        return response(500, {
            'error': 'Failed to publish OTA command',
            'details': str(e)
        })
    
    return response(200, {
        'success': True,
        'message': f'OTA command sent to {device_id}',
        'topic': ota_topic,
        'version': version,
        'firmware_url_expires': f'{S3_PRESIGNED_EXPIRY} seconds'
    })


def get_ota_status(event):
    """
    Lấy trạng thái OTA của device (từ Device Shadow)
    GET /ota/status?device_id=esp32_001
    """
    params = event.get('queryStringParameters') or {}
    device_id = params.get('device_id')
    
    if not device_id:
        return response(400, {'error': 'Missing device_id parameter'})
    
    try:
        # Lấy Device Shadow
        shadow = iot_client.get_thing_shadow(thingName=device_id)
        payload = json.loads(shadow['payload'].read())
        
        return response(200, {
            'device_id': device_id,
            'shadow': payload
        })
        
    except iot_client.exceptions.ResourceNotFoundException:
        return response(404, {
            'error': 'Device not found or no shadow exists',
            'device_id': device_id
        })
    except Exception as e:
        return response(500, {
            'error': 'Failed to get device status',
            'details': str(e)
        })


def response(status_code, body):
    """Create API Gateway response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        },
        'body': json.dumps(body)
    }


# ============================================
# HƯỚNG DẪN THIẾT LẬP
# ============================================
"""
BƯỚC 1: Tạo S3 Bucket cho firmware
- Tên bucket: your-firmware-bucket
- Region: eu-central-1
- Block public access: ON (dùng pre-signed URL)

BƯỚC 2: Upload firmware
- Upload file: firmware/v1.1.0/firmware.bin
- Hoặc dùng AWS CLI:
  aws s3 cp firmware.bin s3://your-firmware-bucket/firmware/v1.1.0/

BƯỚC 3: Tạo Lambda function
- Copy code này vào Lambda
- Runtime: Python 3.12
- Timeout: 30 seconds

BƯỚC 4: Thêm permissions cho Lambda
- AWSIoTDataAccess (publish MQTT)
- S3 read access (generate pre-signed URL):

{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": "arn:aws:s3:::your-firmware-bucket/*"
        }
    ]
}

BƯỚC 5: Tạo API Gateway
- POST /ota/trigger -> Lambda
- GET /ota/status -> Lambda

BƯỚC 6: Test
curl -X POST https://your-api/prod/ota/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "esp32_001",
    "version": "1.1.0",
    "firmware_key": "firmware/v1.1.0/firmware.bin"
  }'
"""
