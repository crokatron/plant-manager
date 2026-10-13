"""NAS worker: current Plant Manager photos, HA view, and bottle-check reminders."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import time
import urllib.request
import uuid
import threading
import re
import urllib.parse
from reminders import Bridge, atomic, CONFIG
from server import App, Conflict
from forecast import DUBAI
from ha_socket import HAWebSocket
from ha_dashboard import ensure_dashboard

SYNC_LOCK=threading.RLock()

def latest_photo(plant, gallery):
    """Prefer a newer gallery upload, retaining a later explicit main photo."""
    def stamp(value):
        try:return dt.datetime.fromisoformat(str(value).replace('Z','+00:00')).replace(tzinfo=None)
        except (ValueError,TypeError):return dt.datetime.min
    current=plant.get('photo');latest=stamp(plant.get('photo_updated_at'))
    for entry in sorted(gallery,key=lambda row:int(row.get('id') or 0)):
        name=entry.get('thumb') or entry.get('original') or ''
        date=stamp(entry.get('created_at'))
        if date>latest and re.fullmatch(r'[\w.-]+\.(?:jpg|jpeg|png|webp|gif)',name,re.I):
            current='/img/'+urllib.parse.quote(name);latest=date
    return current

def image_upload(bridge, photo):
    boundary='PlantPhoto'+uuid.uuid4().hex
    ext,mime=('png','image/png') if photo.startswith(b'\x89PNG\r\n\x1a\n') else ('gif','image/gif') if photo[:6] in (b'GIF87a',b'GIF89a') else ('webp','image/webp') if photo.startswith(b'RIFF') and photo[8:12]==b'WEBP' else ('jpg','image/jpeg')
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="plant.{ext}"\r\nContent-Type: {mime}\r\n\r\n').encode()+photo+f'\r\n--{boundary}--\r\n'.encode()
    req=urllib.request.Request(bridge.config['ha_url']+'/api/image/upload',data=body,
        headers={'Authorization':'Bearer '+bridge.token(),'Content-Type':'multipart/form-data; boundary='+boundary})
    with urllib.request.urlopen(req,timeout=30) as response:
        value=json.load(response)
    return '/api/image/serve/'+value['id']+'/512x512'

def notification_due(state, now, sent):
    local=now.astimezone(DUBAI)
    if (local.hour,local.minute)<(13,30) or local.hour>=21 or sent==local.date().isoformat():
        return []
    friday=local.weekday()==4
    return [p for p in state['plants'] if state['forecasts'].get(str(p['id']),{}).get('due') or state['forecasts'].get(str(p['id']),{}).get('fertilise_due') or
        (friday and bool(state['tracking'].get(str(p['id']),{}).get('bottles',[])))]

def tick(app, bridge):
    state=app.state(); path=app.store.folder/'ha-sync.json'
    cache=json.loads(path.read_text()) if path.exists() else {'photos':{}}
    links=ensure_dashboard(app,bridge,state['plants'])
    plants=[]
    for p in state['plants']:
        pid=str(p['id']); current={**p,'record_url':bridge.config['public_url']+'/plants/details/'+pid,
            'ha_url':links['ha_url']+'/plant-map/plant-'+pid,'qr_url':'HTTPS://PLANTS.MUNGOON.NET/P/'+pid}
        gallery=bridge.hortus('/api/plants/gallery/list',{'plant':p['id']}).get('data',{}).get('gallery') or []
        source_photo=latest_photo(p,gallery)
        if source_photo:
            with urllib.request.urlopen(bridge.config['hortus_url']+source_photo,timeout=20) as response:
                photo=response.read(10_000_001)
            if len(photo)>10_000_000:raise ValueError('Photo too large')
            digest=hashlib.sha256(photo).hexdigest();saved=cache['photos'].get(pid,{})
            if saved.get('sha256')!=digest:
                saved={'sha256':digest,'url':image_upload(bridge,photo)}
                cache['photos'][pid]=saved;atomic(path,cache)
            current['photo']=saved['url']
        plants.append(current)
    # HA provides current state to its card through its authenticated websocket.
    attrs={'friendly_name':'Plant map','icon':'mdi:flower','plants':plants,'floor':state['floor'],
        'tracking':state['tracking'],'forecasts':state['forecasts'],'revision':state['revision'],
        'refill_round':'Friday 13:30 · Dubai',
        'notifications':{'enabled':bool(bridge.config.get('notify_service')),'last_sent_date':cache.get('sent_date'),'last_message':cache.get('last_message'),'last_sent_at':cache.get('last_sent_at'),'daily_window':'13:30–21:00 Dubai','round':'Friday 13:30 Dubai'},
        'updated_at':dt.datetime.now(dt.timezone.utc).isoformat()}
    bridge.ha('states/sensor.mungoon_plant_map',{'state':len(plants),'attributes':attrs})
    now=dt.datetime.now(dt.timezone.utc);due=notification_due(state,now,cache.get('sent_date'))
    if due and bridge.config.get('notify_service'):
        target=links['ha_url']+'/plant-map/home'
        water=[p['name'] for p in due if state['forecasts'].get(str(p['id']),{}).get('due')]
        feed=[p['name'] for p in due if state['forecasts'].get(str(p['id']),{}).get('fertilise_due')]
        message=('Check water/bottles: '+', '.join(water[:6])+'. ' if water else '')+('Fertiliser due: '+', '.join(feed[:6])+'. ' if feed else '')
        if not message:message='Friday bottle round: '+', '.join(p['name'] for p in due[:8])+'. '
        bridge.ha('services/notify/'+bridge.config['notify_service'],{'title':'Friday plant round' if now.astimezone(DUBAI).weekday()==4 else 'Bottle checks due',
            'message':message+'Open Plants in HA to inspect and log care.',
            'data':{'url':target,'clickAction':target,'tag':'mungoon-bottle-checks','channel':'Plant care'}})
        cache['sent_date']=now.astimezone(DUBAI).date().isoformat()
        cache['last_message']=message+'Open Plants in HA to inspect and log care.'
        cache['last_sent_at']=now.isoformat()
        attrs['notifications'].update(last_sent_date=cache['sent_date'],last_message=cache['last_message'],last_sent_at=cache['last_sent_at'])
        bridge.ha('states/sensor.mungoon_plant_map',{'state':len(plants),'attributes':attrs})
    cache['last_sync']=now.isoformat();cache['plant_count']=len(plants);atomic(path,cache)
    return {'plants':len(plants),'due':len(due),'last_sync':cache['last_sync']}

def handle_event(app,bridge,event,owner_id):
    # HA stamps this context server-side; never accept an owner ID in event data.
    if event.get('context',{}).get('user_id')!=owner_id:return
    payload=event.get('data',{})
    if not isinstance(payload,dict) or len(json.dumps(payload))>12000:return
    command=payload.get('command');expected=payload.get('revision')
    if not isinstance(command,dict):return
    request_id=command.get('request_id')
    try:
        state=app.state()
        saved=app.store.apply(command,str(expected),{p['id'] for p in state['plants']},app.floor['rooms'])
        # Publish updated tracking immediately; photo transfer remains on its five-minute schedule.
        previous=bridge.ha('states/sensor.mungoon_plant_map')
        attrs=previous['attributes'];attrs.update(saved)
        from forecast import forecasts
        attrs.update(forecasts=forecasts(saved['tracking']),updated_at=dt.datetime.now(dt.timezone.utc).isoformat())
        bridge.ha('states/sensor.mungoon_plant_map',{'state':len(state['plants']),'attributes':attrs})
        reply={'request_id':request_id,'ok':True,'revision':saved['revision']}
    except (ValueError,Conflict) as exc:reply={'request_id':request_id,'ok':False,'error':str(exc)}
    except Exception:reply={'request_id':request_id,'ok':False,'error':'Could not confirm the save. Retry this same action safely.'}
    bridge.ha('events/mungoon_plant_result',reply)

def listen(app,bridge):
    while True:
        try:
            with HAWebSocket(bridge.token(),bridge.config['ha_url']) as ws:
                user=ws.call('auth/current_user')
                if not user.get('is_owner'):raise ValueError('Owner connection required')
                ws.call('subscribe_events',event_type='mungoon_plant_action')
                ws.sock.settimeout(75)
                while True:
                    message=ws.receive()
                    if message.get('type')=='event':
                        with SYNC_LOCK:handle_event(app,bridge,message['event'],user['id'])
        except Exception as exc:
            print('Plant action connection reconnecting: '+type(exc).__name__,flush=True)
            time.sleep(3)

if __name__=='__main__':
    import sys
    app=App();bridge=Bridge(json.loads(CONFIG.read_text()))
    if '--once' in sys.argv:
        print(json.dumps(tick(app,bridge)))
    else:
        threading.Thread(target=listen,args=(app,bridge),daemon=True).start()
        while True:
            try:
                with SYNC_LOCK:tick(app,bridge)
            except Exception as exc:print('Plant HA sync failed: '+type(exc).__name__,flush=True)
            time.sleep(300)

