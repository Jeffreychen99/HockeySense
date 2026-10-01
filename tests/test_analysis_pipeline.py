import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch
import server
from test_server import report


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = server.DATA
        server.DATA = Path(self.temp.name)
        server.initialize()
        self.frame = server.DATA/'frame.jpg'
        self.frame.write_bytes(b'jpeg')
        self.clip = {'id':'pipeline','filename':'input.mp4','start':0,'end':21,'profile_id':'me','profile_snapshot':{'name':'Me'},'description':'Blue 8','status':'queued'}
        server.save('clips',self.clip)

    def tearDown(self):
        server.DATA = self.old
        self.temp.cleanup()

    def test_completed_sections_resume_without_resending(self):
        frames = [(i,self.frame) for i in range(21)]
        calls = []
        def request(payload, progress):
            bounds = json.loads(payload['input'][0]['content'][0]['text'])['interval_seconds']
            calls.append(bounds)
            if len(calls)==2:
                raise server.CoachingServiceError(server.coaching_error(429))
            value=report();value['moments'][0]['time']=bounds[0]+.5
            return value
        with patch('server.sample_frames',return_value=frames),patch('server.request_report',side_effect=request):
            server.analyze('pipeline')
            partial=server.get('clips','pipeline')
            self.assertEqual(partial['status'],'failed')
            self.assertIsNone(partial['report'])
            self.assertEqual(len(partial['sections']),1)
            server.analyze('pipeline')
        result=server.get('clips','pipeline')
        self.assertEqual(result['status'],'ready')
        self.assertEqual(calls,[[0,10],[10,20],[10,20],[20,21]])
        self.assertEqual(result['coverage']['end'],21)
        self.assertEqual(len(result['report']['moments']),3)

    def test_request_size_is_bounded_and_every_frame_is_sent(self):
        frames=[(i,self.frame) for i in range(31)]
        captured=[]
        def request(payload,progress):
            captured.append(payload)
            bounds=json.loads(payload['input'][0]['content'][0]['text'])['interval_seconds']
            value=report();value['moments']=[]
            return value
        clip=server.get('clips','pipeline');clip['end']=31;server.save('clips',clip)
        with patch('server.sample_frames',return_value=frames),patch('server.request_report',side_effect=request):
            server.analyze('pipeline')
        self.assertEqual(len(captured),4)
        self.assertTrue(all(sum(c['type']=='input_image' for c in p['input'][0]['content'])<=12 for p in captured))
        self.assertEqual(server.get('clips','pipeline')['sampled_frames'],31)

    def test_identity_reference_is_always_explicit_and_labeled(self):
        marked=server.DATA/'marked.jpg';marked.write_bytes(b'marked')
        frames=[(i,self.frame) for i in range(21)]
        captured=[]
        def request(payload,progress):
            captured.append(payload)
            value=report();value['moments']=[]
            return value
        with patch('server.sample_frames',return_value=frames),patch('server.reference_frame',return_value=(0,marked)),patch('server.request_report',side_effect=request):
            server.analyze('pipeline')
        for payload in captured:
            content=payload['input'][0]['content']
            self.assertIn('IDENTITY REFERENCE',content[1]['text'])
            self.assertIn('red box',content[1]['text'])
            self.assertLessEqual(sum(c['type']=='input_image' for c in content),12)

    def test_rate_limit_waits_then_continues(self):
        error=urllib.error.HTTPError('https://api.openai.com',429,'Limited',{'Retry-After':'2'},io.BytesIO(json.dumps({'error':{'code':'rate_limit_exceeded'}}).encode()))
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps({'status':'completed','output':[{'content':[{'type':'output_text','text':json.dumps(report())}]}]}).encode()
        progress=[]
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test'}),patch('server.urllib.request.urlopen',side_effect=[error,Response()]) as request,patch('server.time.sleep') as sleep:
            server.request_report({},lambda *args:progress.append(args))
        self.assertEqual(request.call_count,2)
        sleep.assert_called_once_with(3.0)
        self.assertTrue(any(p[0]=='waiting' for p in progress))

    def test_quota_does_not_retry(self):
        error=urllib.error.HTTPError('https://api.openai.com',429,'Quota',{},io.BytesIO(b'{"error":{"code":"insufficient_quota"}}'))
        with patch.dict('os.environ',{'OPENAI_API_KEY':'test'}),patch('server.urllib.request.urlopen',side_effect=error) as request,patch('server.time.sleep') as sleep:
            with self.assertRaises(server.CoachingServiceError):server.request_report({},lambda *args:None)
        self.assertEqual(request.call_count,1);sleep.assert_not_called()

    def test_restart_requeues_incomplete_job(self):
        with patch.object(server.POOL,'submit') as submit:
            server.initialize(resume_jobs=True)
        submit.assert_called_once_with(server.analyze,'pipeline')
        self.assertEqual(server.get('clips','pipeline')['status'],'queued')
