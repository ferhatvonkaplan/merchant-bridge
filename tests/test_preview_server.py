import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location('preview', Path(__file__).resolve().parents[1] / 'scripts/serve-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.dist = self.root / 'dist'
        self.dist.mkdir()
        (self.dist / 'index.html').write_text('<h1>Public build</h1>')
        (self.dist / 'site-config.json').write_text('{"contactEmail":""}')
        (self.root / 'private.json').write_text('private fixture')
        self.server = preview.create_server(self.dist, 0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temporary.cleanup()

    def test_public_build_and_security_headers(self):
        with urlopen(self.base + '/') as response:
            self.assertIn(b'Public build', response.read())
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertIn("default-src 'none'", response.headers['Content-Security-Policy'])
            self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        with urlopen(Request(self.base + '/site-config.json', method='HEAD')) as response:
            self.assertEqual(response.read(), b'')

    def test_source_private_files_and_traversal_are_unavailable(self):
        for path in ['/../private.json', '/%2e%2e/private.json', '/%252e%252e/private.json', '/.git/config', '/src/App.tsx', '/sales/prospects.csv', '/artifacts/aws-deployment.json', '/assets/', '/package.json']:
            with self.subTest(path=path), self.assertRaises(HTTPError) as error:
                urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404)

    def test_writes_are_rejected(self):
        for method in ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']:
            with self.subTest(method=method), self.assertRaises(HTTPError) as error:
                urlopen(Request(self.base + '/index.html', data=b'overwrite', method=method))
            self.assertEqual(error.exception.code, 405)
        self.assertEqual((self.dist / 'index.html').read_text(), '<h1>Public build</h1>')

    def test_unexpected_build_files_are_rejected(self):
        (self.dist / '.env').write_text('fixture')
        with self.assertRaises(ValueError):
            preview.build_manifest(self.dist)

    def test_symlinks_are_rejected(self):
        (self.dist / 'linked.json').symlink_to(self.root / 'private.json')
        with self.assertRaises(ValueError):
            preview.build_manifest(self.dist)


if __name__ == '__main__':
    unittest.main()
