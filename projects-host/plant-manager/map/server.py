"""Private Plant Manager companion. Existing nginx owner authentication is required."""

import datetime as dt

from contextlib import contextmanager

import hashlib

import json

import math

import os

from pathlib import Path

import re

import sqlite3

import threading

from forecast import forecasts

import urllib.parse

import urllib.request

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer



ROOT = Path(__file__).resolve().parent

DATA = Path(os.environ.get('PLANT_MAP_DATA', '/data'))

OWNER = 'lamont.leras@gmail.com'

ORIGIN = 'https://plants.mungoon.net'

UTC = dt.timezone.utc





class Conflict(Exception):

    pass





def timestamp(value):

    try:

        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))

        if parsed.tzinfo is None:

            raise ValueError()

        return parsed.astimezone(UTC)

    except (ValueError, TypeError, AttributeError):

        raise ValueError('Choose a valid date and time.') from None





def point_inside(point, polygon):

    x, y = point

    inside = False

    for i, (ax, ay) in enumerate(polygon):

        bx, by = polygon[i - 1]

        if abs((x-ax)*(by-ay)-(y-ay)*(bx-ax)) < .001 and min(ax,bx)-.01 <= x <= max(ax,bx)+.01 and min(ay,by)-.01 <= y <= max(ay,by)+.01:

            return True

        if (ay > y) != (by > y) and x < (bx-ax)*(y-ay)/(by-ay)+ax:

            inside = not inside

    return inside





def new_plant():

    return {'position':None, 'notes':'', 'bottles':[], 'moves':[], 'last_event':None,

            'quarantine':False, 'pest_events':[], 'feeds':[], 'feed_interval_days':None}





def project(events):

    plants = {}

    for event in events:

        if event['undone']:

            continue

        pid = str(event['plant_id'])

        p = plants.setdefault(pid, new_plant())

        value = json.loads(event['payload'])

        p['last_event'] = event['id']

        action = event['action']

        if action == 'move':

            p['position'] = value

            p['moves'].append({**value, 'at': event['at']})

        elif action == 'profile':

            p.update(value)

        elif action == 'add_bottle':

            p['bottles'].append({'id':value['bottle_id'],'capacity_ml':value['capacity_ml'],'cycles':[]})

        elif action == 'pests':

            p['quarantine'] = True

            p['pest_events'].append({'at':event['at'],'status':'quarantine','notes':value['notes']})

        elif action == 'clear_quarantine':

            p['quarantine'] = False

            p['pest_events'].append({'at':event['at'],'status':'cleared','notes':value['notes']})

        elif action == 'feed_schedule':

            p['feed_interval_days'] = value['days']

        elif action == 'fertilised':

            p['feeds'].append(event['at'])

        elif action in ('refill', 'empty_refill'):

            bottle = next(b for b in p['bottles'] if b['id']==value['bottle_id'])

            if bottle['cycles'] and not bottle['cycles'][-1].get('ended_at'):

                bottle['cycles'][-1].update(ended_at=event['at'], end_reason='empty' if action=='empty_refill' else 'replaced', exact=False)

            bottle['capacity_ml'] = value['capacity_ml']

            bottle['cycles'].append({'filled_at': event['at'], 'capacity_ml': value['capacity_ml'], 'room': (p['position'] or {}).get('room'), 'bottle_count':len(p['bottles']), 'ended_at': None, 'end_reason': None, 'checks':[]})

        elif action == 'check':

            bottle = next(b for b in p['bottles'] if b['id']==value['bottle_id'])

            bottle['cycles'][-1].setdefault('checks',[]).append(event['at'])

        elif action == 'level':

            bottle = next(b for b in p['bottles'] if b['id']==value['bottle_id'])

            bottle.setdefault('inspections',[]).append({'at':event['at'],'level':value['level'],

                'room':(p['position'] or {}).get('room'),'bottle_count':len(p['bottles'])})

            if bottle['cycles'] and not bottle['cycles'][-1].get('ended_at'):

                bottle['cycles'][-1].setdefault('checks',[]).append(event['at'])

                bottle['cycles'][-1].setdefault('levels',[]).append({'at':event['at'],'level':value['level']})

                if value['level']==0:

                    bottle['cycles'][-1].update(ended_at=event['at'],end_reason='empty',exact=False)

        elif action == 'empty':

            bottle = next(b for b in p['bottles'] if b['id']==value['bottle_id'])

            if not bottle['cycles']:

                bottle['cycles'].append({'filled_at': None, 'capacity_ml': bottle['capacity_ml'], 'room': (p['position'] or {}).get('room')})

            bottle['cycles'][-1].update(ended_at=event['at'], end_reason='empty', exact=value['exact'])

    return plants





class Store:

    def __init__(self, folder):

        self.folder = Path(folder)

        self.folder.mkdir(parents=True, exist_ok=True)

        self.path = self.folder / 'plants.sqlite3'

        with self.db() as db:

            db.executescript('''

                CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);

                INSERT OR IGNORE INTO meta VALUES (1,0);

                CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, plant_id INTEGER NOT NULL,

                    action TEXT NOT NULL, at TEXT NOT NULL, payload TEXT NOT NULL, undone INTEGER NOT NULL DEFAULT 0);

                CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL);

            ''')

        os.chmod(self.path, 0o600)



    @contextmanager

    def db(self):

        db = sqlite3.connect(self.path, timeout=15)

        db.row_factory = sqlite3.Row

        db.execute('PRAGMA busy_timeout=15000')

        try:

            with db:

                yield db

        finally:

            db.close()



    def snapshot(self, db=None):

        if db is None:

            with self.db() as connection:

                connection.execute('BEGIN')

                return self.snapshot(connection)

        revision = db.execute('SELECT revision FROM meta WHERE id=1').fetchone()[0]

        events = db.execute('SELECT * FROM events ORDER BY id').fetchall()

        return {'revision': revision, 'tracking': project(events)}



    def apply(self, command, expected, known_ids, rooms, now=None):

        now = now or dt.datetime.now(UTC)

        request_id = command.get('request_id', '')

        if not re.fullmatch(r'[a-f0-9-]{32,36}', request_id):

            raise ValueError('Missing action reference. Reload and retry.')

        raw = json.dumps(command, sort_keys=True, separators=(',', ':'))

        fingerprint = hashlib.sha256(raw.encode()).hexdigest()

        with self.db() as db:

            db.execute('BEGIN IMMEDIATE')

            duplicate = db.execute('SELECT fingerprint FROM requests WHERE id=?', (request_id,)).fetchone()

            if duplicate:

                if duplicate[0] != fingerprint:

                    raise Conflict('This action reference was already used. Reload and retry.')

                return self.snapshot(db)

            current = self.snapshot(db)

            if expected != str(current['revision']):

                raise Conflict('Another device saved a newer update. Reload before trying again.')

            pid = command.get('plant_id')

            if type(pid) is not int or pid not in known_ids:

                raise ValueError('This plant is no longer in the collection. Refresh the list.')

            p = current['tracking'].get(str(pid), new_plant())

            action = command.get('action')

            at = now

            value = {}

            if action == 'move':

                room = next((r for r in rooms if r['id'] == command.get('room')), None)

                x, y = command.get('x'), command.get('y')

                if not room or any(type(v) not in (int,float) or not math.isfinite(v) for v in (x,y)) or not point_inside((x,y),room['points']):

                    raise ValueError('Place the plant inside the selected room.')

                value = {'room': room['id'], 'x': round(x,2), 'y': round(y,2)}

            elif action == 'profile':

                notes = command.get('notes', '')

                if not isinstance(notes,str) or len(notes)>2000:

                    raise ValueError('Keep plant notes under 2,000 characters.')

                value = {'notes': notes.strip()}

            elif action == 'add_bottle':

                capacity = command.get('capacity_ml')

                if capacity not in (750,1000) or len(p['bottles'])>=12:

                    raise ValueError('Choose 750 ml or 1 L. A plant can have up to 12 bottles.')

                value = {'bottle_id':'b'+str(len(p['bottles'])+1), 'capacity_ml':capacity}

            elif action in ('pests','clear_quarantine'):

                notes=command.get('notes','')

                if not isinstance(notes,str) or len(notes)>1000:raise ValueError('Keep inspection notes under 1,000 characters.')

                value={'notes':notes.strip()}

            elif action == 'feed_schedule':

                days=command.get('days')

                if days is not None and (type(days) is not int or not 1<=days<=365):raise ValueError('Choose an interval from 1 to 365 days, or pause reminders.')

                value={'days':days}

            elif action == 'fertilised':

                at=timestamp(command.get('at'))

                if at>now+dt.timedelta(minutes=2) or at<now-dt.timedelta(days=366):raise ValueError('Choose a feed date within the past year.')

                if p['feeds'] and at<timestamp(p['feeds'][-1]):raise ValueError('This feed is before the previous feed. Undo that entry to correct it.')

            elif action in ('refill','empty','empty_refill','check','level'):

                bottle = next((b for b in p['bottles'] if b['id']==command.get('bottle_id')),None)

                if not bottle:

                    raise ValueError('Choose one of this plant’s bottles.')

                at = timestamp(command.get('at'))

                if at > now + dt.timedelta(minutes=2) or at < now - dt.timedelta(days=366):

                    raise ValueError('Choose a time within the past year, not in the future.')

                last = bottle['cycles'][-1] if bottle['cycles'] else None

                if bottle.get('inspections') and at<timestamp(bottle['inspections'][-1]['at']):

                    raise ValueError('This time is before the previous inspection.')

                if last:

                    previous = last.get('ended_at') or last.get('filled_at')

                    if last.get('checks'):

                        previous = max(previous, last['checks'][-1])

                    if previous and at < timestamp(previous):

                        raise ValueError('This time is before the previous bottle event. Undo the last event to correct it.')

                if action in ('refill','empty_refill'):

                    capacity = command.get('capacity_ml')

                    if capacity not in (750,1000):

                        raise ValueError('Choose a 750 ml or 1 L bottle.')

                    if action=='refill' and last and not last.get('ended_at') and command.get('replace_active') is not True:

                        raise Conflict('The current bottle is still marked in use. Confirm replacement or mark it empty first.')

                    value = {'capacity_ml': capacity, 'bottle_id':bottle['id']}

                elif action == 'level':

                    level=command.get('level')

                    if type(level) is not int or not 0<=level<=100:raise ValueError('Choose an approximate level between 0% and 100%.')

                    if last and last.get('ended_at'):raise Conflict('This bottle is marked empty. Record a refill before a level inspection.')

                    levels=last.get('levels',[]) if last else bottle.get('inspections',[])

                    if levels and level>levels[-1]['level']:raise Conflict('The level rose. Record a top-up/refill, or undo the previous inspection to correct it.')

                    value={'bottle_id':bottle['id'],'level':level}

                elif action == 'check':

                    if not last or last.get('ended_at'):

                        raise Conflict('Record a refill before checking a bottle in use.')

                    value = {'bottle_id':bottle['id']}

                else:

                    if last and last.get('ended_at'):

                        raise Conflict('This bottle is already marked empty. Record a refill to start the next bottle.')

                    value = {'exact': command.get('exact') is True, 'bottle_id':bottle['id']}

            elif action == 'undo':

                if p['last_event'] is None or command.get('event_id') != p['last_event']:

                    raise Conflict('The latest action changed. Reload before undoing.')

                db.execute('UPDATE events SET undone=1 WHERE id=? AND plant_id=?', (p['last_event'],pid))

            else:

                raise ValueError('Unknown action.')

            if action != 'undo':

                db.execute('INSERT INTO events(plant_id,action,at,payload) VALUES(?,?,?,?)', (pid,action,at.isoformat(),json.dumps(value)))

            db.execute('UPDATE meta SET revision=revision+1 WHERE id=1')

            db.execute('INSERT INTO requests VALUES(?,?)',(request_id,fingerprint))

            return self.snapshot(db)





class Hortus:

    def __init__(self, config_path):

        self.config_path = Path(config_path)



    def plants(self):

        config = json.loads(self.config_path.read_text())

        # The existing key stays in a POST body on the private Docker network.

        body = urllib.parse.urlencode({'token': config['api_key']}).encode()

        def get(path):

            request=urllib.request.Request(config['hortus_url']+path,data=body,

                headers={'Content-Type':'application/x-www-form-urlencoded'})

            with urllib.request.urlopen(request,timeout=20) as response:result=json.loads(response.read(8_000_000))

            if result.get('code')!=200 or not isinstance(result.get('list') or [],list):raise RuntimeError('Plant collection unavailable')

            return result.get('list') or []

        collection=[]

        # HortusFox requires a location for its plant-list endpoint.

        for location in get('/api/locations/list'):

            collection.extend(get('/api/plants/list?location='+str(int(location['id']))))

        rows = []

        for plant in collection:

            if str(plant.get('history',0)) == '1':

                continue

            photo = plant.get('photo') or ''

            safe_photo = '/img/'+urllib.parse.quote(photo) if re.fullmatch(r'[\w.-]+\.(?:jpg|jpeg|png|webp|gif)',photo,re.I) else None

            rows.append({'id':int(plant['id']), 'name':str(plant.get('name') or 'Unnamed plant'),

                'scientific_name':str(plant.get('scientific_name') or ''), 'photo':safe_photo,

                'photo_updated_at':plant.get('last_photo_date')})

        return rows





class App:

    def __init__(self, folder=DATA, hortus=None):

        self.store = Store(folder)

        self.floor = json.loads((Path(folder)/'floor-plan.json').read_text())

        self.hortus = hortus or Hortus('/run/secrets/plants.json')



    def state(self):

        state = self.store.snapshot()

        return {**state, 'forecasts':forecasts(state['tracking']), 'plants':self.hortus.plants(), 'floor':self.floor, 'timezone':'Asia/Dubai'}





def handler(app):

    class Handler(BaseHTTPRequestHandler):

        def log_message(self, *_):

            pass



        def send(self, value, status=200, revision=None):

            body = json.dumps(value,ensure_ascii=False).encode()

            self.send_response(status)

            self.send_header('Content-Type','application/json; charset=utf-8')

            self.send_header('Content-Length',str(len(body)))

            self.send_header('Cache-Control','no-store')

            self.send_header('X-Content-Type-Options','nosniff')

            if revision is not None:

                self.send_header('ETag','"'+str(revision)+'"')

            self.end_headers()

            self.wfile.write(body)



        def authorized(self):

            if self.headers.get('X-Mungoon-Email') != OWNER:

                self.send({'error':'Owner sign-in required.'},403)

                return False

            return True



        def do_GET(self):

            if not self.authorized():

                return

            path = urllib.parse.urlsplit(self.path).path

            if re.fullmatch(r'/P/[1-9][0-9]*',path):

                try:

                    pid=int(path.rsplit('/',1)[1])

                    if pid not in {p['id'] for p in app.hortus.plants()}:return self.send({'error':'Plant no longer in active collection.'},404)

                    links=json.loads((app.store.folder/'ha-links.json').read_text())

                    self.send_response(302)

                    self.send_header('Location',links['ha_url']+'/plant-map/plant-'+str(pid))

                    self.send_header('Cache-Control','no-store');self.end_headers()

                except Exception:self.send({'error':'Plant page is still syncing. Try again shortly.'},503)

                return

            if path == '/plant-map/api/state':

                try:

                    state = app.state()

                    self.send(state,revision=state['revision'])

                except Exception:

                    self.send({'error':'The plant collection could not load. Try Refresh.'},503)

                return

            assets = {'/plant-map/':'index.html','/plant-map/app.js':'app.js','/plant-map/water-status.js':'water-status.js','/plant-map/plant-clusters.js':'plant-clusters.js','/plant-map/plant-camera.js':'plant-camera.js','/plant-map/style.css':'style.css','/plant-map/nav.js':'nav.js'}

            if path not in assets:

                return self.send({'error':'Not found'},404)

            body = (ROOT/assets[path]).read_bytes()

            self.send_response(200)

            self.send_header('Content-Type',{'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}[assets[path].rsplit('.',1)[-1]])

            self.send_header('Content-Length',str(len(body)))

            self.send_header('Cache-Control','no-cache')

            self.send_header('X-Content-Type-Options','nosniff')

            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")

            self.end_headers()

            self.wfile.write(body)



        def do_POST(self):

            if not self.authorized():

                return

            if self.headers.get('Origin') != ORIGIN or self.headers.get('Sec-Fetch-Site') == 'cross-site':

                return self.send({'error':'Open Plant map from your Plant Manager.'},403)

            if self.path != '/plant-map/api/action':

                return self.send({'error':'Not found'},404)

            if self.headers.get('Content-Type','').split(';')[0] != 'application/json':

                return self.send({'error':'JSON required'},415)

            try:

                size = int(self.headers.get('Content-Length','0'))

                if not 0 < size <= 12000 or self.headers.get('Transfer-Encoding'):

                    raise ValueError('Invalid request size.')

                command = json.loads(self.rfile.read(size))

                if not isinstance(command,dict):

                    raise ValueError('Invalid action.')

                known = {p['id'] for p in app.hortus.plants()}

                result = app.store.apply(command,self.headers.get('If-Match','').strip('"'),known,app.floor['rooms'])

                result['forecasts'] = forecasts(result['tracking'])

                self.send(result,revision=result['revision'])

            except Conflict as exc:

                self.send({'error':str(exc)},409)

            except (ValueError,TypeError) as exc:

                self.send({'error':str(exc)},400)

            except Exception:

                self.send({'error':'Could not save this action. Refresh to check its status before retrying.'},503)

    return Handler





if __name__ == '__main__':

    app = App()

    ThreadingHTTPServer(('0.0.0.0',8080),handler(app)).serve_forever()

