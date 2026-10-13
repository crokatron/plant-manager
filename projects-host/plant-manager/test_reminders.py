import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo
import reminders as r


class RemindersTest(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 10, 4, 9, tzinfo=ZoneInfo('Asia/Dubai'))
        self.tasks = [dict(id=1, title='Check Alocasia', done=0, due_date='2026-10-04 00:00:00'),
                      dict(id=2, title='Fertilize', done=0, due_date='2026-10-01 00:00:00'),
                      dict(id=3, title='Future', done=0, due_date='2026-10-05 00:00:00'),
                      dict(id=4, title='Done', done=1, due_date='2026-10-01 00:00:00'),
                      dict(id=5, title='No date', done=0, due_date=None)]

    def test_due_dates_and_completion(self):
        self.assertEqual([t['id'] for t in r.due_tasks(self.tasks, self.now)], [2, 1])

    def test_recurrence_only_after_completion_preserves_days(self):
        task = dict(id=9, done=1, recurring_time=168, recurring_scope='days')
        self.assertEqual(r.next_occurrence(task, self.now), dict(task=9, done=0, due_date='2026-10-11 09:00:00', recurring_time=7, recurring_scope='days'))
        self.assertIsNone(r.next_occurrence({**task, 'done': 0}, self.now))
        self.assertIsNone(r.next_occurrence({**task, 'recurring_time': None}, self.now))

    def test_daily_dedup_quiet_hours_and_send_failure(self):
        class Fake(r.Bridge):
            def __init__(self, tasks):
                super().__init__({'notify_service': 'mobile_app_test', 'hour': 9})
                self.tasks, self.sent, self.fail = tasks, [], False
            def hortus(self, path, params=None):
                return {'data': [] if params.get('done') else self.tasks}
            def send(self, message):
                if self.fail:
                    raise RuntimeError('Delivery failed')
                self.sent.append(message)
        with tempfile.TemporaryDirectory() as folder, patch.object(r, 'STATE', Path(folder)):
            bridge = Fake(self.tasks)
            bridge.tick(self.now.replace(hour=8))
            self.assertEqual(bridge.sent, [])
            bridge.fail = True
            with self.assertRaises(RuntimeError):
                bridge.tick(self.now)
            self.assertNotIn('sent_date', json.loads((Path(folder)/'state.json').read_text()))
            bridge.fail = False
            bridge.tick(self.now)
            bridge.tick(self.now.replace(hour=10))
            self.assertEqual(len(bridge.sent), 1)
            bridge.tick(self.now + dt.timedelta(days=1))
            self.assertEqual(len(bridge.sent), 2)

    def test_no_tasks_no_notification(self):
        self.assertEqual(r.due_tasks([], self.now), [])


if __name__ == '__main__':
    unittest.main()
