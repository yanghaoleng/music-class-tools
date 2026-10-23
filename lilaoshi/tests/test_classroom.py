import importlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'server'))

class ClassroomTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        os.environ['MUSICCLASS_DB']=str(Path(self.tmp.name)/'test.sqlite3')
        os.environ['MUSICCLASS_SECRET']='classroom-test-only-secret-32-characters'
        import app
        self.app=importlib.reload(app)
        self.app.init_db()
    def tearDown(self):self.tmp.cleanup()
    def test_notes_are_not_swapped_when_options_are_permuted(self):
        for q in self.app.QUESTIONS:
            for order in ([0,1],[1,0]):
                resolved=self.app.resolve_question(q['id'],'base',order)
                self.assertEqual(resolved.get('why'),q.get('why'))
                if q['kind']=='choice':
                    self.assertEqual(resolved['coachOpening'],q['coachOpening'])
                    self.assertEqual(resolved['visuals'][resolved['correct']],q['visuals'][q['correct']])
    def test_each_chapter_records_all_eight_answers_before_completion(self):
        for start,syllabus in self.app.CHAPTER_QUESTIONS.items():
            shared={k:str(uuid.uuid4()) for k in ['visitor','session','run']}
            def event(kind,**values):return {'id':str(uuid.uuid4()),'kind':kind,'course':2,**shared,**values}
            self.app.collect(event('start',start=start,questions=list(syllabus)))
            with self.assertRaises(ValueError):self.app.collect(event('complete'))
            for qid in syllabus:
                q=self.app.QUESTIONS[qid]
                self.app.collect(event('answer',q=qid,choice=1 if q['kind']=='open' else q['correct']))
            self.app.collect(event('complete'))
        with self.app.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM events WHERE kind='complete'").fetchone()[0],7)
            self.assertEqual(db.execute("SELECT count(*) FROM events WHERE kind='answer'").fetchone()[0],56)
    def test_music_teacher_context_has_no_claim_of_hearing_users(self):
        import reviewer
        self.assertIn('没有用户音频',reviewer.SYSTEM)
        self.assertNotIn('中文设计教练',reviewer.SYSTEM)

if __name__=='__main__':unittest.main()
