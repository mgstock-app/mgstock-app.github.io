"""Servidor de prueba de la caja app: sirve public/ e imita la API RPC de Supabase (PostgREST)
sobre un Postgres local con la migración real. Solo para pruebas locales / CI. Uso:
  CAJA_PG="-h 127.0.0.1 -p 5432 -U postgres" python3 servidor.py 8765   (usa la base «cajaui» de reiniciar-base.sh)
"""
import base64
import http.server
import json
import os
import re
import secrets
import shlex
import subprocess
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'public'))
PG = shlex.split(os.environ.get('CAJA_PG', '-h /home/claude/pgcaja -p 55432 -U postgres')) + ['-d', 'cajaui']


def literal(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return "'" + repr(v) + "'"
    if isinstance(v, list):
        partes = ['"' + str(x).replace('\\', '\\\\').replace('"', '\\"') + '"' for x in v]
        v = '{' + ','.join(partes) + '}'
    elif isinstance(v, dict):
        v = json.dumps(v, ensure_ascii=False)
    tag = 'v' + secrets.token_hex(6)
    return '$' + tag + '$' + str(v) + '$' + tag + '$'


def claims_de(auth):
    m = re.match(r'Bearer\s+(.+)', auth or '')
    if not m:
        return {'role': 'anon'}
    partes = m.group(1).split('.')
    if len(partes) < 2:
        return {'role': 'anon'}
    p = partes[1] + '=' * (-len(partes[1]) % 4)
    try:
        c = json.loads(base64.urlsafe_b64decode(p))
    except Exception:
        return {'role': 'anon'}
    return c if c.get('sub') else {'role': 'anon'}


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=RAIZ, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/caja/config.js':
            cuerpo = ("window.CAJA_CONFIG={url:'http://%s',key:'anon-prueba'};" % self.headers.get('Host')).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Content-Length', str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        m = re.match(r'^/rest/v1/rpc/(caja_app_[a-z_]+)$', self.path.split('?')[0])
        if not m:
            return self.responder(404, {'code': 'PGRST202', 'message': 'Could not find the function'})
        largo = int(self.headers.get('Content-Length') or 0)
        args = json.loads(self.rfile.read(largo) or b'{}') if largo else {}
        claims = claims_de(self.headers.get('Authorization'))
        rol = 'authenticated' if claims.get('sub') else 'anon'
        lista = ', '.join('%s => %s' % (k, literal(v)) for k, v in args.items() if re.match(r'^p_[a-z_]+$', k))
        sql = ("\\set VERBOSITY verbose\n\\pset tuples_only on\nbegin;\n\\o /dev/null\n"
               "select set_config('request.jwt.claims', %s, true);\nset local role %s;\n\\o\n"
               "\\echo <<<INICIO\nselect public.%s(%s);\n\\echo FIN>>>\ncommit;\n") % (literal(json.dumps(claims)), rol, m.group(1), lista)
        r = subprocess.run(['psql', *PG, '-X', '-q', '-A', '-v', 'ON_ERROR_STOP=1'], input=sql, capture_output=True, text=True)
        if r.returncode != 0:
            e = re.search(r'ERROR:\s+([0-9A-Z]{5}):\s+(.*)', r.stderr)
            codigo, msg = (e.group(1), e.group(2).strip()) if e else ('XX000', r.stderr.strip())
            return self.responder(403 if codigo == '42501' else 400, {'code': codigo, 'message': msg, 'details': None, 'hint': None})
        bloque = r.stdout.split('<<<INICIO', 1)[-1].split('FIN>>>', 1)[0]
        valor = bloque.strip()
        if valor == '':
            self.send_response(204)
            self.end_headers()
            return
        try:
            datos = json.loads(valor)
        except ValueError:
            datos = valor
        return self.responder(200, datos)


if __name__ == '__main__':
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(('127.0.0.1', puerto), Manejador).serve_forever()
