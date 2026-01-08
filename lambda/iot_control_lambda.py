"""
AWS Lambda Function - ESP32 IoT Control via REST API

Endpoints:
- GET  /led?action=on|off    → Bật/tắt đèn
- POST /command              → Gửi lệnh tùy chỉnh

Deploy: Copy code này vào AWS Lambda Console

Author: Your Name
Date: 2026-01-08
"""

import json
import boto3
from datetime import datetime
from urllib.parse import parse_qs

# ============================================
# CẤU HÌNH
# ============================================
IOT_REGION = 'eu-central-1'
IOT_TOPIC = 'cmd/esp32'

# Khởi tạo IoT Data client
iot_client = boto3.client('iot-data', region_name=IOT_REGION)


def lambda_handler(event, context):
    """
    Main Lambda handler
    """
    print(f"Received event: {json.dumps(event)}")
    
    try:
        # Lấy HTTP method và path
        # Hỗ trợ cả REST API (v1) và HTTP API (v2)
        http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'GET')
        
        # Lấy path - hỗ trợ nhiều format
        path = event.get('path') or event.get('rawPath') or event.get('resource', '/')
        
        # Nếu path chứa stage name, loại bỏ nó
        # VD: /api_esp32/led -> /led
        if path.count('/') > 1:
            parts = path.split('/')
            path = '/' + parts[-1]  # Lấy phần cuối
        
        print(f"Method: {http_method}, Path: {path}")
        
        # Route requests
        if '/led' in path or path == '/':
            return handle_led_control(event)
        elif '/command' in path:
            return handle_custom_command(event)
        elif '/status' in path:
            return handle_status()
        else:
            # Mặc định xử lý như LED control
            return handle_led_control(event)
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return response(500, {'error': str(e)})


def handle_led_control(event):
    """
    Xử lý điều khiển LED đơn giản
    GET /led?action=on|off
    """
    # Debug: Log toàn bộ event để xem cấu trúc
    print(f"Full event: {json.dumps(event)}")
    
    # Thử nhiều cách lấy query parameters
    params = None
    
    # Cách 1: Lambda Proxy Integration (API Gateway REST API)
    if event.get('queryStringParameters'):
        params = event.get('queryStringParameters')
        print(f"Got params from queryStringParameters: {params}")
    
    # Cách 2: HTTP API (API Gateway v2)
    elif event.get('rawQueryString'):
        raw = event.get('rawQueryString', '')
        params = dict(x.split('=') for x in raw.split('&') if '=' in x)
        print(f"Got params from rawQueryString: {params}")
    
    # Cách 3: Direct từ event (non-proxy integration)
    elif event.get('action'):
        params = {'action': event.get('action')}
        print(f"Got params directly from event: {params}")
    
    # Cách 4: Parse từ rawPath hoặc path
    elif event.get('rawPath') or event.get('path'):
        path = event.get('rawPath') or event.get('path', '')
        if '?' in path:
            query = path.split('?')[1]
            params = dict(x.split('=') for x in query.split('&') if '=' in x)
            print(f"Got params from path: {params}")
    
    if not params:
        params = {}
        print("No params found!")
    
    action = params.get('action', '').lower()
    print(f"Action value: '{action}'")
    
    if action not in ['on', 'off']:
        return response(400, {
            'error': 'Invalid action',
            'usage': 'GET /led?action=on or GET /led?action=off',
            'received_params': params,
            'debug': {
                'queryStringParameters': event.get('queryStringParameters'),
                'rawQueryString': event.get('rawQueryString'),
                'path': event.get('path'),
                'rawPath': event.get('rawPath')
            }
        })
    
    command = 'LED_ON' if action == 'on' else 'LED_OFF'
    
    payload = {
        'command': command,
        'source': 'REST_API',
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Publish to IoT
    publish_result = publish_to_iot(payload)
    
    if publish_result['success']:
        return response(200, {
            'success': True,
            'message': f'LED turned {action.upper()}',
            'topic': IOT_TOPIC,
            'payload': payload
        })
    else:
        return response(500, {
            'success': False,
            'error': publish_result['error']
        })


def handle_custom_command(event):
    """
    Xử lý lệnh tùy chỉnh
    POST /command
    Body: {"command": "...", "data": {...}}
    """
    if event.get('httpMethod') != 'POST':
        return response(405, {'error': 'Method not allowed. Use POST.'})
    
    try:
        body = json.loads(event.get('body', '{}'))
    except json.JSONDecodeError:
        return response(400, {'error': 'Invalid JSON body'})
    
    if 'command' not in body:
        return response(400, {
            'error': 'Missing "command" field',
            'usage': 'POST /command with body {"command": "YOUR_COMMAND", "data": {...}}'
        })
    
    payload = {
        'command': body.get('command'),
        'data': body.get('data', {}),
        'source': 'REST_API',
        'timestamp': datetime.utcnow().isoformat()
    }
    
    # Publish to IoT
    publish_result = publish_to_iot(payload)
    
    if publish_result['success']:
        return response(200, {
            'success': True,
            'message': 'Command published',
            'topic': IOT_TOPIC,
            'payload': payload
        })
    else:
        return response(500, {
            'success': False,
            'error': publish_result['error']
        })


def handle_status():
    """
    Kiểm tra trạng thái API
    GET /status
    """
    return response(200, {
        'status': 'online',
        'region': IOT_REGION,
        'topic': IOT_TOPIC,
        'timestamp': datetime.utcnow().isoformat()
    })


def publish_to_iot(payload):
    """
    Publish message to IoT topic
    """
    try:
        iot_client.publish(
            topic=IOT_TOPIC,
            qos=0,
            payload=json.dumps(payload)
        )
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def response(status_code, body):
    """
    Create API Gateway response with CORS headers
    """
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        },
        'body': json.dumps(body)
    }
