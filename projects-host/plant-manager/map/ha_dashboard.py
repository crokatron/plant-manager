"""Create/update only our marked plant views; preserve all other dashboard content."""
import copy
import json
from urllib.parse import urlsplit
from reminders import atomic
from ha_socket import HAWebSocket

RESOURCE='/local/mungoon/ha-plants-card.js?v=20261012-plant-groups-1'
PATH='plant-map'

def merge_views(current,plants):
    result=copy.deepcopy(current)
    views=result.setdefault('views',[])
    wanted=[('home','Plants',None)]+[('plant-'+str(p['id']),p['name'],p['id']) for p in plants]
    for path,title,pid in wanted:
        existing=next((v for v in views if v.get('path')==path),None)
        if existing and existing.get('mungoon_plants') is not True:raise ValueError('An existing plant view has different ownership.')
        card={'type':'custom:mungoon-plants-card','mungoon_plants':True}
        if pid is not None:card['plant_id']=pid
        if existing:
            owned=[i for i,c in enumerate(existing.get('cards',[])) if c.get('mungoon_plants') is True]
            if len(owned)!=1:raise ValueError('Plant view card ownership changed.')
            existing['cards'][owned[0]]=card
            existing['title']=title
            if len(existing['cards'])==1:existing['type']='panel'
        else:
            views.append({'title':title,'path':path,'type':'panel','subview':pid is not None,'mungoon_plants':True,'cards':[card]})
    return result

def ensure_dashboard(app,bridge,plants):
    with HAWebSocket(bridge.token(),bridge.config['ha_url']) as ws:
        user=ws.call('auth/current_user')
        if not user.get('is_owner'):raise ValueError('The existing HA connection must belong to the owner.')
        config=ws.call('get_config')
        base=config.get('external_url') or config.get('internal_url') or bridge.config['ha_url']
        url=urlsplit(base)
        if url.scheme not in ('http','https') or not url.hostname or url.username:raise ValueError('Invalid HA address.')
        dashboards=ws.call('lovelace/dashboards/list')
        existing=next((d for d in dashboards if d.get('url_path')==PATH),None)
        if not existing:
            ws.call('lovelace/dashboards/create',url_path=PATH,title='Plants',icon='mdi:flower',show_in_sidebar=True,require_admin=True)
            original={'views':[]}
        else:
            original=ws.call('lovelace/config',url_path=PATH)
        updated=merge_views(original,plants)
        if updated!=original:
            backup=app.store.folder/'ha-dashboard-before.json'
            if not backup.exists():atomic(backup,original)
            # Refuse a concurrent edit before writing, except the just-created empty dashboard.
            if existing and ws.call('lovelace/config',url_path=PATH)!=original:raise ValueError('Plant dashboard changed while reading.')
            ws.call('lovelace/config/save',url_path=PATH,config=updated)
        resources=ws.call('lovelace/resources')
        match=next((r for r in resources if r.get('url','').split('?')[0]==RESOURCE.split('?')[0]),None)
        if not match:ws.call('lovelace/resources/create',res_type='module',url=RESOURCE)
        elif match['url']!=RESOURCE:ws.call('lovelace/resources/update',resource_id=match['id'],res_type='module',url=RESOURCE)
    links={'ha_url':base.rstrip('/'),'owner_id':user['id'],'dashboard':PATH}
    atomic(app.store.folder/'ha-links.json',links)
    return links
