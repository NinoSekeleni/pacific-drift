#!/bin/zsh
set -e
cd "$(dirname "$0")/dist"
exec python3 - <<'PY'
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import webbrowser

class Server(ThreadingHTTPServer):
    allow_reuse_address = True

try:
    server = Server(('127.0.0.1', 4173), SimpleHTTPRequestHandler)
except OSError:
    print('Another copy may still be running. Close its terminal window, then reopen this updated launcher.')
    input('Press Enter to close this window.')
    raise SystemExit(1)
print('Pacific Drift is running at http://127.0.0.1:4173/ . Keep this window open while playing; press Control-C to stop.')
webbrowser.open('http://127.0.0.1:4173/')
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
PY
