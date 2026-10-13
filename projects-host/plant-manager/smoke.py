"""Create and remove our own temporary records to validate the running application."""
import datetime as dt
import json
from pathlib import Path
import sys
import tempfile
import http.cookiejar
import urllib.parse
import urllib.request
sys.path.insert(0, '/app')
import reminders as r

config = json.loads(r.CONFIG.read_text())
config['notify_service'] = ''
bridge = r.Bridge(config)
plant = task = None
before = bridge.hortus('/api/tasks/fetch', {'done': 0, 'limit': 10000}).get('data') or []
try:
    plant = bridge.hortus('/api/plants/add', {'name': 'Temporary installation check', 'location': 1})['plant']
    task = bridge.hortus('/api/tasks/add', {'title': 'Temporary care check', 'description': 'Installer-owned test record', 'due_date': '2026-10-01 09:00:00', 'recurring_time': 7, 'recurring_scope': 'days', 'plant': plant})['item']
    tasks = bridge.hortus('/api/tasks/fetch', {'done': 0, 'limit': 10000})['data']
    record = next(t for t in tasks if int(t['id']) == int(task))
    assert int(record['recurring_time']) == 168
    assert int(record['id']) in [int(t['id']) for t in r.due_tasks(tasks, dt.datetime.now(bridge.zone))]
    bridge.hortus('/api/tasks/edit', {'task': task, 'done': 1, 'recurring_time': 7, 'recurring_scope': 'days'})
    with tempfile.TemporaryDirectory() as folder:
        r.STATE = Path(folder)
        bridge.tick()
    tasks = bridge.hortus('/api/tasks/fetch', {'done': 0, 'limit': 10000})['data']
    record = next(t for t in tasks if int(t['id']) == int(task))
    assert int(record['recurring_time']) == 168
    due = dt.datetime.fromisoformat(record['due_date']).replace(tzinfo=bridge.zone)
    assert 6.99 < (due-dt.datetime.now(bridge.zone)).total_seconds()/86400 < 7.01
    print('PASS: plant creation, due-task detection, completion and seven-day recurrence.')
finally:
    if task is not None:
        bridge.hortus('/api/tasks/remove', {'task': task})
    if plant is not None:
        # Upstream plant removal needs a user session even with a valid API key.
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        headers = {'X-Mungoon-Email': 'lamont.leras@gmail.com', 'X-Mungoon-Name': 'Lamont'}
        opener.open(urllib.request.Request(config['hortus_url']+'/', headers=headers), timeout=25).close()
        url = config['hortus_url']+'/api/plants/remove?plant='+str(plant)
        body = urllib.parse.urlencode({'token': config['api_key']}).encode()
        with opener.open(urllib.request.Request(url, data=body), timeout=25) as response:
            assert json.load(response)['code'] == 200
after = bridge.hortus('/api/tasks/fetch', {'done': 0, 'limit': 10000}).get('data') or []
assert before == after
print('PASS: temporary records removed; original task list preserved.')
