"""本機假後端：行為照 backend/Code.gs，用來測網站的讀寫邏輯。資料只放記憶體。
用法：python3 tools/mock_api.py [port]
另外提供 /_fail?on=1 讓 save 故意失敗，用來測斷線。
"""
import json, sys, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

NAMES = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
PEOPLE = [{'id': 'p%02d' % (i + 1), 'token': 'tok-%02d' % (i + 1), 'name': n, 'honor': i == 3} for i, n in enumerate(NAMES)]
ANSWERS = {}
FAIL = {'on': False}


def handle(req):
    me = next((p for p in PEOPLE if p['token'] == req.get('token')), None)
    if not me:
        return {'ok': False, 'error': 'bad_token'}
    done = [i for i, s in ANSWERS.items() if s.get('submittedAt')]
    a = req.get('action')
    if a == 'init':
        honor = next(p for p in PEOPLE if p['honor'])
        return {'ok': True, 'me': {'id': me['id'], 'name': me['name'], 'guestOfHonor': me['honor']},
                'roster': [{'id': p['id'], 'name': p['name']} for p in PEOPLE], 'honorId': honor['id'],
                'state': ANSWERS.get(me['id']), 'done': done}
    if a == 'cover':
        import base64, os
        f = os.path.join(os.path.dirname(__file__), '..', 'photos', 'IMG_6968.jpg')
        return {'ok': True, 'dataUrl': 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode()}
    if a == 'progress':
        return {'ok': True, 'done': done}
    if a == 'save':
        if FAIL['on']:
            raise RuntimeError('forced failure')
        ANSWERS[me['id']] = req['state']
        return {'ok': True, 'savedAt': datetime.datetime.now().isoformat()}
    return {'ok': False, 'error': 'bad_action'}


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if u.path == '/_fail':
            FAIL['on'] = q.get('on') == '1'
            return self._send(200, {'fail': FAIL['on']})
        if u.path == '/_dump':
            return self._send(200, ANSWERS)
        self._send(200, handle(q))

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            self._send(200, handle(json.loads(self.rfile.read(n))))
        except Exception as e:
            self._send(500, {'ok': False, 'error': str(e)})

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4341
    ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
