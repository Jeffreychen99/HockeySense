"""Integration tests against a temporary local server; no paid API requests."""
import http.server
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
import server


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old = server.DATA
        server.DATA = Path(cls.temp.name)
        server.initialize()
        cls.http = http.server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        server.DATA = cls.old
        cls.temp.cleanup()

    def request(self, path, body=None, headers=None):
        return urllib.request.urlopen(urllib.request.Request(self.base+path, data=json.dumps(body).encode() if body is not None else None, headers=headers or {}))

    def test_static_and_state_do_not_expose_key(self):
        with self.request('/') as response:
            self.assertIn(b'HockeySense', response.read())
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'private-test-value'}):
            with self.request('/api/state') as response:
                data = response.read()
                self.assertNotIn(b'private-test-value', data)
                self.assertTrue(json.loads(data)['configured'])

    def test_foreign_origins_cannot_write_profiles(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/api/profiles', {'name':'Intruder'}, {'Origin':'https://example.com'})
        self.assertEqual(error.exception.code, 400)
        error.exception.close()
        self.assertEqual(server.records('profiles'), [])

    def test_video_seeking_and_unsatisfiable_ranges(self):
        name = 'a'*32+'.mp4'
        (server.DATA/'videos'/name).write_bytes(b'0123456789')
        for header, expected in [('bytes=2-5', b'2345'), ('bytes=-3', b'789'), ('bytes=7-', b'789')]:
            with self.request('/media/'+name, headers={'Range':header}) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.read(), expected)
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/media/'+name, headers={'Range':'bytes=20-'})
        self.assertEqual(error.exception.code, 416)
        error.exception.close()

    def test_replay_cache_head_and_if_range(self):
        name = 'b'*32+'-replay.mp4'
        (server.DATA/'videos'/name).write_bytes(b'0123456789')
        with self.request('/media/'+name) as response:
            etag = response.headers['ETag']
            self.assertIn('private', response.headers['Cache-Control'])
            self.assertEqual(response.read(), b'0123456789')
        request = urllib.request.Request(self.base+'/media/'+name, method='HEAD')
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.headers['Content-Length'], '10')
            self.assertEqual(response.read(), b'')
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.request('/media/'+name, headers={'If-None-Match':etag})
        self.assertEqual(error.exception.code, 304)
        error.exception.close()
        with self.request('/media/'+name, headers={'Range':'bytes=2-5', 'If-Range':etag}) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.read(), b'2345')
        with self.request('/media/'+name, headers={'Range':'bytes=2-5', 'If-Range':'old-version'}) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), b'0123456789')

    def test_full_clip_can_exceed_ninety_seconds_and_acknowledges_before_work(self):
        server.save('profiles', {'id':'long-player','name':'Test'})
        server.save('clips', {'id':'long-clip','status':'uploaded','duration':200})
        with patch.dict('os.environ', {'OPENAI_API_KEY':'test'}), patch.object(server.POOL,'submit') as submit:
            with self.request('/api/analyze', {'id':'long-clip','profile_id':'long-player','start':0,'end':200,'jersey_color':'Blue','jersey_number':'8'}) as response:
                result=json.load(response)
            self.assertEqual(result['status'],'queued')
            self.assertEqual(result['end'],200)
            submit.assert_called_once_with(server.analyze,'long-clip')

    def test_interval_validation_before_model_request(self):
        server.save('profiles', {'id':'p','name':'Test'})
        server.save('clips', {'id':'c','status':'uploaded','duration':200})
        with patch.dict('os.environ', {'OPENAI_API_KEY':'test'}):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/analyze', {'id':'c','profile_id':'p','start':0,'end':201,'description':'White #17'})
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
        self.assertEqual(server.get('clips', 'c')['status'], 'uploaded')

    def test_identity_is_required_and_both_selection_methods_work(self):
        server.save('profiles', {'id':'identity-player','name':'Test'})
        body = {'id':'identity-clip','profile_id':'identity-player','start':0,'end':5}
        with patch.dict('os.environ', {'OPENAI_API_KEY':'test'}), patch.object(server.POOL, 'submit') as submit:
            server.save('clips', {'id':'identity-clip','status':'uploaded','duration':10})
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/analyze', body)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
            submit.assert_not_called()
            for identity in [{'jersey_color':'White','jersey_number':'17'}, {'reference':{'time':1,'x':.4,'y':.5}}]:
                server.save('clips', {'id':'identity-clip','status':'uploaded','duration':10})
                with self.request('/api/analyze', {**body, **identity}) as response:
                    self.assertEqual(json.load(response)['status'], 'queued')
            self.assertEqual(submit.call_count, 2)


if __name__ == '__main__': unittest.main()
