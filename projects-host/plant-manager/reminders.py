"""NAS-only HortusFox reminders. Credentials never enter HTTP URLs or logs."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

STATE = Path(os.environ.get('PLANT_STATE', '/data'))
CONFIG = Path(os.environ.get('PLANT_CONFIG', '/run/secrets/plants.json'))
HA_CREDENTIALS = Path(os.environ.get('HA_CREDENTIALS', '/run/secrets/home-assistant.json'))
SCOPE_HOURS = {'hours': 1, 'days': 24, 'weeks': 168, 'months': 672, 'years': 8760}


def atomic(path, value):
    temp = path.with_suffix('.tmp')
    fd = os.open(temp, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as out:
        json.dump(value, out)
    os.replace(temp, path)


def due_tasks(tasks, now):
    result = []
    for task in tasks:
        if str(task.get('done', 0)) not in ('0', 'False') or not task.get('due_date'):
            continue
        try:
            due = dt.datetime.fromisoformat(task['due_date'])
            if due.tzinfo is None:
                due = due.replace(tzinfo=now.tzinfo)
            if due.date() <= now.date():
                result.append(task)
        except (ValueError, TypeError):
            continue
    return sorted(result, key=lambda t: (t['due_date'], int(t['id'])))


def next_occurrence(task, now):
    hours = int(task.get('recurring_time') or 0)
    if str(task.get('done')) not in ('1', 'True') or hours <= 0:
        return None
    scope = task.get('recurring_scope', 'hours')
    divisor = SCOPE_HOURS.get(scope, 1)
    if hours % divisor:
        scope, divisor = 'hours', 1
    return {'task': task['id'], 'done': 0,
            'due_date': (now + dt.timedelta(hours=hours)).strftime('%Y-%m-%d %H:%M:%S'),
            'recurring_time': hours // divisor, 'recurring_scope': scope}


def make_message(tasks):
    titles = ['• ' + str(task.get('title') or 'Plant care')[:120] for task in tasks[:10]]
    if len(tasks) > 10:
        titles.append('…and ' + str(len(tasks) - 10) + ' more')
    return '\n'.join(titles) + '\nCheck the soil before watering; mark completed care in Plants.'


def fetch_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read(2_000_000))


class Bridge:
    def __init__(self, config):
        self.config = config
        zone = config.get('timezone', 'Asia/Dubai')
        try:
            self.zone = ZoneInfo(zone)
        except ZoneInfoNotFoundError:
            if zone != 'Asia/Dubai':
                raise
            self.zone = dt.timezone(dt.timedelta(hours=4), 'Asia/Dubai')
        self.access_token = None
        self.expires = 0

    def hortus(self, path, params=None):
        url = self.config['hortus_url'] + path
        if params:
            url += '?' + urllib.parse.urlencode(params)
        data = urllib.parse.urlencode({'token': self.config['api_key']}).encode()
        result = fetch_json(url, data, {'Content-Type': 'application/x-www-form-urlencoded'})
        if result.get('code') != 200:
            raise RuntimeError('HortusFox request failed')
        return result

    def token(self):
        if self.expires > time.time():
            return self.access_token
        credentials = json.loads(HA_CREDENTIALS.read_text())
        if credentials.get('expires_at', 0) > time.time() + 60:
            self.access_token = credentials['access_token']
            self.expires = credentials['expires_at']
        else:
            fields = {'grant_type': 'refresh_token', 'refresh_token': credentials['refresh_token'],
                      'client_id': self.config['ha_client']}
            value = fetch_json(self.config['ha_url'] + '/auth/token', urllib.parse.urlencode(fields).encode(),
                               {'Content-Type': 'application/x-www-form-urlencoded'})
            self.access_token = value['access_token']
            self.expires = time.time() + value.get('expires_in', 1800) - 60
        return self.access_token

    def ha(self, path, data=None):
        headers = {'Authorization': 'Bearer ' + self.token()}
        if data is not None:
            headers['Content-Type'] = 'application/json'
        return fetch_json(self.config['ha_url'] + '/api/' + path,
                          json.dumps(data).encode() if data is not None else None, headers)

    def targets(self):
        return sorted(name for domain in self.ha('services') if domain['domain'] == 'notify'
                      for name in domain['services'] if name.startswith('mobile_app_'))

    def send(self, message, title='Plant care', test=False):
        service = self.config.get('notify_service', '')
        if not service.startswith('mobile_app_') or not all(c.isalnum() or c == '_' for c in service):
            raise RuntimeError('Choose a phone notification target')
        target = self.config['public_url'] + '/tasks'
        return self.ha('services/notify/' + service, {'title': title, 'message': message,
                       'data': {'url': target, 'clickAction': target,
                                'tag': 'mungoon-plants-test' if test else 'mungoon-plants-daily',
                                'channel': 'Plant care', 'actions': [{'action': 'URI', 'title': 'Open plant tasks', 'uri': target}]}})

    def tick(self, now=None):
        now = now or dt.datetime.now(self.zone)
        state_file = STATE / 'state.json'
        state = json.loads(state_file.read_text()) if state_file.exists() else {}
        # HortusFox's native recurrence advances overdue tasks regardless of completion.
        # This bridge instead advances completed recurring care, retaining the native care log.
        for task in self.hortus('/api/tasks/fetch', {'done': 1, 'limit': 10000}).get('data') or []:
            params = next_occurrence(task, now)
            if params:
                self.hortus('/api/tasks/edit', params)
        tasks = self.hortus('/api/tasks/fetch', {'done': 0, 'limit': 10000}).get('data') or []
        due = due_tasks(tasks, now)
        today = now.date().isoformat()
        if self.config.get('notify_service') and now.hour >= int(self.config.get('hour', 9)) and now.hour < 21 and state.get('sent_date') != today and due:
            self.send(make_message(due))
            state['sent_date'] = today
            state['sent_count'] = len(due)
        state.update(last_check=now.isoformat(), due_count=len(due), error=None)
        atomic(state_file, state)
        return {'due_count': len(due), 'sent_date': state.get('sent_date'), 'last_check': state['last_check']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', action='store_true')
    parser.add_argument('--test', action='store_true')
    parser.add_argument('--once', action='store_true')
    args = parser.parse_args()
    bridge = Bridge(json.loads(CONFIG.read_text()))
    if args.targets:
        print(json.dumps(bridge.targets()))
        return
    if args.test:
        bridge.send('Your NAS plant manager is ready. Watering and fertilizer reminders will appear here when your tasks are due.', title='Plant reminders connected', test=True)
        print('Home Assistant accepted the test notification.')
        return
    if args.once:
        print(json.dumps(bridge.tick()))
        return
    while True:
        try:
            bridge.tick()
        except Exception as exc:
            # Exceptions can include API responses or credential-bearing request details.
            # Record only the exception class; never log exception strings or headers.
            atomic(STATE / 'error.json', {'at': time.time(), 'kind': type(exc).__name__})
            print('Plant reminder check failed: ' + type(exc).__name__, flush=True)
        time.sleep(300)


if __name__ == '__main__':
    main()
