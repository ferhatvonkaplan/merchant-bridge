#!/usr/bin/env python3
"""Serve only the production build on loopback for a temporary HTTPS preview.

No filesystem browsing, source access, uploads, API routes or directory listings.
Pair with an explicitly scoped Cloudflare Quick Tunnel; this is not permanent hosting.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_SUFFIXES = {'.html', '.js', '.css', '.json', '.svg', '.png', '.webp', '.ico', '.jpg', '.jpeg', '.gif', '.woff', '.woff2', '.ttf', '.otf', '.txt', '.md'}
CSP = "; ".join([
    "default-src 'none'", "script-src 'self'", "style-src 'self'",
    "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
    "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'",
    "form-action 'none'",
])


def build_manifest(directory: Path) -> dict[str, Path]:
    directory = directory.resolve()
    manifest: dict[str, Path] = {}
    for path in sorted(directory.rglob('*')):
        relative = path.relative_to(directory)
        if path.is_symlink():
            raise ValueError('Symlinks are not allowed in the public build.')
        if not path.is_file():
            continue
        if any(part.startswith('.') for part in relative.parts) or path.suffix not in ALLOWED_SUFFIXES:
            raise ValueError('Only public static build files may be served.')
        if directory not in path.resolve().parents:
            raise ValueError('Build file resolves outside the public directory.')
        manifest['/' + relative.as_posix()] = path
    if '/index.html' not in manifest:
        raise ValueError('Build dist/ before starting the preview.')
    manifest['/'] = manifest['/index.html']
    return manifest


def create_server(directory: Path, port: int) -> ThreadingHTTPServer:
    directory = directory.resolve()
    manifest = build_manifest(directory)

    class Handler(BaseHTTPRequestHandler):
        server_version = 'MerchantBridgePreview/1.0'
        sys_version = ''

        def log_message(self, *_):
            # No visitor paths, query strings, product samples or IPs are logged.
            pass

        def send_static_headers(self, status: int, length: int, mime: str, cache: str = 'no-store'):
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(length))
            self.send_header('Cache-Control', cache)
            self.send_header('Content-Security-Policy', CSP)
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('X-Frame-Options', 'DENY')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
            if status == 405:
                self.send_header('Allow', 'GET, HEAD')
            self.end_headers()

        def serve(self, body: bool):
            try:
                path = unquote(urlsplit(self.path).path, errors='strict')
            except (ValueError, UnicodeError):
                path = ''
            file = manifest.get(path)
            if not file or file.is_symlink() or directory not in file.resolve().parents or not file.is_file():
                response = b'Not found.\n'
                self.send_static_headers(404, len(response), 'text/plain; charset=utf-8')
                if body:
                    self.wfile.write(response)
                return
            data = file.read_bytes()
            mime = {'.js': 'application/javascript', '.json': 'application/json', '.md': 'text/markdown'}.get(file.suffix) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
            cache = 'public, max-age=31536000, immutable' if path.startswith('/assets/') else 'no-store'
            self.send_static_headers(200, len(data), mime, cache)
            if body:
                self.wfile.write(data)

        def do_GET(self):
            self.serve(True)

        def do_HEAD(self):
            self.serve(False)

        def reject_write(self):
            response = b'Method not allowed.\n'
            self.send_static_headers(405, len(response), 'text/plain; charset=utf-8')
            self.wfile.write(response)

        do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = reject_write

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4174)
    parser.add_argument('--directory', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    server = create_server(args.directory, args.port)
    print(f'Public build preview: http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
