"""Owner-only NAS -> HA integration. Credentials and retry state never enter releases."""
import base64, copy, hashlib, html, json, math, os, re, secrets, socket, ssl, struct, threading, time
import urllib.parse, urllib.request
from pathlib import Path

HA_URL = 'http://192.168.0.223'
HA_CLIENT = 'https://projects.mungoon.net/'
HA_REDIRECT = HA_CLIENT + 'floor-plan/'
HA_DASHBOARD = 'floor-plan'
HA_CARD_RESOURCE = '/local/mungoon/ha-floor-card-v2.js?v=20261008-devices-1'

class HAError(Exception):
    pass

def ha_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()

def ha_atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'wb') as out: out.write(ha_json(value))
    os.replace(temp, path)
    os.chmod(path, 0o600)

def ha_read(path, default):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else copy.deepcopy(default)

class HAWebSocket:
    """Small bounded RFC6455 client, avoiding a new NAS runtime dependency."""
    def __init__(self, token, url=HA_URL):
        self.sock = None
        self.id = 0
        try:
            parsed = urllib.parse.urlparse(url)
            self.sock = socket.create_connection((parsed.hostname, parsed.port or (443 if parsed.scheme == 'https' else 80)), timeout=15)
            if parsed.scheme == 'https': self.sock = ssl.create_default_context().wrap_socket(self.sock, server_hostname=parsed.hostname)
            key = base64.b64encode(os.urandom(16)).decode()
            self.sock.sendall((f'GET /api/websocket HTTP/1.1\r\nHost: {parsed.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
            header = b''
            while not header.endswith(b'\r\n\r\n'):
                header += self.exact(1)
                if len(header) > 16384: raise HAError('Invalid HA connection response.')
            lines = header.decode().split('\r\n')
            fields = {k.lower().strip():v.strip() for k,v in (line.split(':',1) for line in lines[1:] if ':' in line)}
            accept = base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            if ' 101 ' not in lines[0] or fields.get('sec-websocket-accept') != accept: raise HAError('HA WebSocket upgrade failed.')
            if self.receive().get('type') != 'auth_required': raise HAError('Unexpected HA authentication response.')
            self.send({'type':'auth', 'access_token':token})
            if self.receive().get('type') != 'auth_ok': raise HAError('Home Assistant sign-in expired. Reconnect HA.')
        except Exception:
            self.close()
            raise

    def exact(self, count):
        chunks = bytearray()
        while len(chunks) < count:
            part = self.sock.recv(count-len(chunks))
            if not part: raise HAError('Home Assistant closed the connection.')
            chunks.extend(part)
        return bytes(chunks)

    def frame(self, data, opcode=1):
        size = len(data)
        head = bytes([0x80 | opcode, 0x80 | (size if size < 126 else 126 if size < 65536 else 127)])
        if size >= 126: head += struct.pack('!H' if size < 65536 else '!Q', size)
        mask = os.urandom(4)
        self.sock.sendall(head + mask + bytes(b ^ mask[i%4] for i,b in enumerate(data)))

    def send(self, value): self.frame(ha_json(value))

    def receive(self):
        data = bytearray()
        while True:
            first, second = self.exact(2)
            opcode = first & 15
            size = second & 127
            if first & 0x70 or second & 128: raise HAError('Unsupported HA WebSocket frame.')
            if size == 126: size = struct.unpack('!H', self.exact(2))[0]
            elif size == 127: size = struct.unpack('!Q', self.exact(8))[0]
            if size + len(data) > 16000000: raise HAError('HA response is too large.')
            payload = self.exact(size)
            if opcode == 8: raise HAError('Home Assistant closed the connection.')
            if opcode == 9: self.frame(payload, 10); continue
            if opcode == 10: continue
            if opcode not in (0,1): raise HAError('Unsupported HA message.')
            data.extend(payload)
            if first & 128: return json.loads(data)

    def call(self, command, **values):
        self.id += 1
        self.send({'id':self.id, 'type':command, **values})
        for _ in range(100):
            message = self.receive()
            if message.get('id') != self.id: continue
            if not message.get('success'):
                # Do not forward remote error bodies (which can contain private data).
                raise HAError('Home Assistant rejected '+command+'. Check administrator access and retry.')
            return message.get('result')
        raise HAError('Home Assistant did not confirm the request.')

    def close(self):
        if self.sock: self.sock.close(); self.sock = None
    def __enter__(self): return self
    def __exit__(self, *args): self.close()

