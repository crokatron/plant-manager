"""One-time photo import. Keeps native Plant Manager IDs and resumable checkpoints."""
import json,sys,urllib.parse,urllib.request,uuid
from pathlib import Path
from server import App, point_inside
from reminders import atomic

def api(config,path,params=None,photo=None):
    url=config['hortus_url']+path+('?' + urllib.parse.urlencode(params) if params else '')
    if photo:
        boundary='PlantImport'+uuid.uuid4().hex
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="token"\r\n\r\n{config["api_key"]}\r\n--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="plant.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode()+photo+f'\r\n--{boundary}--\r\n'.encode()
        content='multipart/form-data; boundary='+boundary
    else:
        body=urllib.parse.urlencode({'token':config['api_key']}).encode();content='application/x-www-form-urlencoded'
    with urllib.request.urlopen(urllib.request.Request(url,data=body,headers={'Content-Type':content}),timeout=60) as response:
        value=json.load(response)
    if value.get('code')!=200:raise RuntimeError('Native plant API rejected import')
    return value

def main(folder):
    source=Path(folder);entries=json.loads((source/'import.json').read_text());app=App()
    if any(not (source/row['file']).is_file() for row in entries):raise ValueError('All plant photos must be staged before import.')
    config=json.loads(Path('/run/secrets/plants.json').read_text());checkpoint=app.store.folder/'photo-import-20261008.json'
    saved=json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    rooms={'Hall':'hall','Den':'living','Guest Bedroom':'guest','Man Cave Bathroom':'mancave-bath'}
    grouped={}
    for row in entries:
        grouped.setdefault(row['room'],[]).append(row['reference'])
    for row in entries:
        key=row['reference'];name=row['name'];found=[p for p in app.hortus.plants() if p['name']==name]
        if key not in saved:
            if found:raise RuntimeError('Existing name needs explicit reconciliation: '+key)
            saved[key]={'name':name,'pending':True};atomic(checkpoint,saved)
            value=api(config,'/api/plants/add',{'name':name,'location':1},(source/row['file']).read_bytes())
            saved[key]={'id':int(value['plant']),'name':name};atomic(checkpoint,saved)
        elif saved[key].get('pending'):
            if len(found)!=1:raise RuntimeError('Import outcome unknown; inspect '+key)
            saved[key]={'id':found[0]['id'],'name':name};atomic(checkpoint,saved)
        pid=saved[key]['id']
        if saved[key].get('complete'):continue
        notes=row['notes']+' Import reference: 20261008/'+key+'. Room confirmed by owner: '+row['room']+'. Initial map spot is approximate within that room.'
        api(config,'/api/plants/update',{'plant':pid,'attribute':'notes','value':notes})
        room=next(r for r in app.floor['rooms'] if r['id']==rooms[row['room']])
        xs=[p[0] for p in room['points']];ys=[p[1] for p in room['points']]
        spots=[(min(xs)+(max(xs)-min(xs))*x/8,min(ys)+(max(ys)-min(ys))*y/8) for y in range(1,8) for x in range(1,8)]
        spots=[p for p in spots if point_inside(p,room['points'])]
        idx=grouped[row['room']].index(key);point=spots[(idx*3)%len(spots)]
        commands=[{'action':'move','room':room['id'],'x':point[0],'y':point[1]}, {'action':'profile','notes':notes}]+[{'action':'add_bottle','capacity_ml':size or 750} for size in row['visible_bottles']]
        known={p['id'] for p in app.hortus.plants()}
        for index,command in enumerate(commands):
            # Stable request references make an interrupted import safe to resume.
            app.store.apply({**command,'plant_id':pid,'request_id':str(uuid.uuid5(uuid.NAMESPACE_URL,'mungoon-import-20261008/'+key+'/'+str(index)))},str(app.store.snapshot()['revision']),known,app.floor['rooms'])
        saved[key]['complete']=True;atomic(checkpoint,saved);print(key,pid,'imported',flush=True)
    print('Complete:',sum(bool(x.get('complete')) for x in saved.values()))
if __name__=='__main__':main(sys.argv[1])

