import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


def report():
    return {'summary': 'Test', 'visibility': 'Limited', 'strengths': [], 'moments': [{'time': 2.5, 'title': 'Support', 'category': 'Positioning', 'confidence': 'high', 'observation': 'Wide spacing', 'why': 'Passing option', 'better_option': 'Close gap', 'cue': 'Stay available', 'style_connection': '', 'evidence':'At 2.5s a visible teammate is separated by a blocked lane', 'game_situation':'The outlet lane is blocked', 'assessment':'supported_correction', 'impact':'medium', 'decision_window':'The open lane remains available while the player holds possession', 'actionability':'realistic', 'ambiguity':'none_material', 'player_role':'off_puck', 'identity_evidence':'Selected dark blue player visible beside the boards', 'possession_evidence':'', 'possession_times':[]}], 'practice': [], 'style_notes': ''}


class CoachingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = server.DATA
        server.DATA = Path(self.temp.name)
        server.initialize()

    def tearDown(self):
        server.DATA = self.old
        self.temp.cleanup()

    def test_unsupported_findings_and_dependent_drills_are_removed(self):
        for change in ({'ambiguity':'material'}, {'ambiguity':'unresolved'}, {'confidence':'medium'}, {'actionability':'uncertain'}, {'actionability':'not_actionable'}, {'decision_window':''}, {'assessment':'uncertain'}, {'assessment':'positive'}, {'evidence':''}, {'game_situation':''}, {'confidence':'low'}):
            result = report()
            result['moments'][0].update(change)
            result['practice'] = [{'category':'Positioning','title':'Outlet drill','instructions':'Move to an open lane','dose':'5 reps','success_measure':'Open lane','style_connection':'','moment_times':[2.5]}]
            checked = server.validate_result(result, {'start':0,'end':10})
            self.assertEqual(checked['moments'], [])
            self.assertEqual(checked['practice'], [])

    def test_possession_claim_requires_resolved_identity_and_distinct_frames(self):
        for change in ({'player_role':'uncertain'}, {'identity_evidence':''},
                       {'player_role':'puck_carrier','possession_evidence':'Puck near stick','possession_times':[2.5]},
                       {'player_role':'puck_carrier','possession_evidence':'Puck near stick','possession_times':[2.5,2.5]}):
            result = report()
            result['moments'][0].update(change)
            self.assertEqual(server.validate_result(result, {'start':0,'end':10})['moments'], [])

    def test_drill_links_only_keep_supported_moments(self):
        result = report()
        result['practice'] = [{'category':'Positioning','title':'Outlet drill','instructions':'Move to an open lane','dose':'5 reps','success_measure':'Open lane','style_connection':'','moment_times':[2.5,4]}]
        checked = server.validate_result(result, {'start':0,'end':10})
        self.assertEqual(checked['practice'][0]['moment_times'], [2.5])

    def test_rejects_out_of_clip_timestamps(self):
        result = report()
        result['moments'][0]['time'] = 200
        with self.assertRaises(ValueError):
            server.validate_result(result, {'start': 0, 'end': 10})

    def test_rejects_unsupported_category_and_missing_evidence(self):
        for change in ['category', 'observation']:
            result = report()
            if change == 'category':
                result['moments'][0][change] = 'Made up category'
            else:
                del result['moments'][0][change]
            with self.assertRaises(ValueError):
                server.validate_result(result, {'start': 0, 'end': 10})

    def test_profile_persistence_and_restart_recovery(self):
        server.save('profiles', {'id': 'p', 'name': 'Test', 'play_like': 'Crosby', 'skate_like': 'McDavid'})
        server.save('clips', {'id': 'c', 'status': 'analyzing'})
        server.initialize()
        self.assertEqual(server.get('profiles', 'p')['skate_like'], 'McDavid')
        self.assertEqual(server.get('clips', 'c')['status'], 'failed')

    def test_empty_evidence_is_a_valid_report(self):
        result = report()
        result['moments'] = []
        self.assertEqual(server.validate_result(result, {'start': 0, 'end': 10})['moments'], [])

    def test_analysis_transmits_goals_and_only_same_profile_history(self):
        clip = {'id': 'c', 'status': 'queued', 'profile_id': 'p', 'profile_snapshot': {'play_like': 'Crosby', 'skate_like': 'McDavid'}, 'description': 'White #17', 'start': 0, 'end': 4, 'filename': 'test.mp4'}
        server.save('clips', clip)
        server.save('clips', {'id': 'mine', 'review_version':6, 'status': 'ready', 'profile_id': 'p', 'report': {'summary': 'MY HISTORY'}})
        server.save('clips', {'id': 'other', 'review_version':6, 'status': 'ready', 'profile_id': 'q', 'report': {'summary': 'OTHER HISTORY'}})
        captured = {}
        def fake_frame(args, **kwargs):
            Path(args[-1]).write_bytes(b'jpeg')
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps({'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': json.dumps(report())}]}]}).encode()
        def fake_request(req, **kwargs):
            captured.update(json.loads(req.data))
            return Response()
        frame = Path(self.temp.name) / 'frame.jpg'
        frame.write_bytes(b'jpeg')
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'test'}), patch('server.sample_frames', return_value=[(0,frame),(1,frame),(2,frame),(3,frame)]), patch('server.urllib.request.urlopen', fake_request):
            server.analyze('c')
        result = server.get('clips', 'c')
        self.assertEqual(result['status'], 'ready')
        context = captured['input'][0]['content'][0]['text']
        self.assertIn('Crosby', context)
        self.assertIn('McDavid', context)
        self.assertIn('MY HISTORY', context)
        self.assertNotIn('OTHER HISTORY', context)
        self.assertFalse(captured['store'])


if __name__ == '__main__': unittest.main()
