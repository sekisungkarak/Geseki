import time
from http.server import HTTPServer, SimpleHTTPRequestHandler

trigger_queue = []

class RelayServer(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_POST(self):
        if self.path == "/trigger_test":
            length = int(self.headers.get('content-length', 0))
            data = self.rfile.read(length).decode('utf-8')
            trigger_queue.append(data)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"OK")
            return
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/poll_test"):
            self.send_response(200)
            self.end_headers()
            # Long-polling loop (max 10 seconds per request)
            for _ in range(20):
                if trigger_queue:
                    # Pop the event and send it
                    self.wfile.write(trigger_queue.pop(0).encode('utf-8'))
                    return
                time.sleep(0.5)
            # If nothing happens, return empty string
            self.wfile.write(b"")
            return
            
        # Serve static files as usual
        return super().do_GET()

    # Suppress normal logging for the poll to avoid terminal spam
    def log_message(self, format, *args):
        if 'poll_test' not in args[0]:
            super().log_message(format, *args)

if __name__ == '__main__':
    print("Serving Geseki local server on http://127.0.0.1:3000 ...")
    HTTPServer(("127.0.0.1", 3000), RelayServer).serve_forever()