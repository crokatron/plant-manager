"""Observed bottle delivery, not biological water uptake. No invented starting data."""
import datetime as dt
from statistics import median

UTC = dt.timezone.utc
DUBAI = dt.timezone(dt.timedelta(hours=4))
def friday_round(now):
    local=now.astimezone(DUBAI)
    next_round=local.replace(hour=13,minute=30,second=0,microsecond=0)+dt.timedelta(days=(4-local.weekday())%7)
    if next_round<=local:
        next_round+=dt.timedelta(days=7)
    return next_round
def parse(value):
    return dt.datetime.fromisoformat(value.replace('Z','+00:00'))

def forecasts(tracking, now=None, target_days=7):
    now = now or dt.datetime.now(UTC)
    result = {}
    batch=friday_round(now)
    for pid,p in tracking.items():
        bottles = []
        room = (p['position'] or {}).get('room')
        for b in p['bottles']:
            samples = []
            level_samples=[]
            for c in b['cycles']:
                if c.get('filled_at') and c.get('room')==room and c.get('bottle_count')==len(p['bottles']):
                    observations=[{'at':c['filled_at'],'level':100}]+c.get('levels',[])
                    for left,right in zip(observations,observations[1:]):
                        start,end=parse(left['at']),parse(right['at'])
                        drop=left['level']-right['level']
                        days=(end-start).total_seconds()/86400
                        if drop>0 and days>=1/24 and not any(start<parse(m['at'])<end and m['room']!=room for m in p['moves']):
                            level_samples.append({'days_per_ml':days/(c['capacity_ml']*drop/100),'exact':False})
                if not c.get('filled_at') or c.get('end_reason')!='empty':
                    continue
                start,end = parse(c['filled_at']),parse(c['ended_at'])
                if c.get('room')!=room or c.get('bottle_count')!=len(p['bottles']):
                    continue
                if any(start < parse(m['at']) < end and m['room']!=room for m in p['moves']):
                    continue
                duration = (end-start).total_seconds()/86400
                if duration >= 1/24:
                    samples.append({'days_per_ml':duration/c['capacity_ml'],'exact':c.get('exact',False)})
            samples = samples[-5:]
            if not samples:samples=level_samples[-5:]
            c = b['cycles'][-1] if b['cycles'] else None
            typical = median(s['days_per_ml'] for s in samples) if samples else None
            rate = 1/typical if typical else None
            due = predicted = None
            if c and not c.get('ended_at'):
                start = parse(c['filled_at'])
                predicted = start+dt.timedelta(days=typical*c['capacity_ml']) if typical else None
                if c.get('levels') and typical:
                    observation=c['levels'][-1]
                    predicted=parse(observation['at'])+dt.timedelta(days=typical*c['capacity_ml']*observation['level']/100)
                # Start checks early; a late empty observation is only an upper bound.
                due = start+dt.timedelta(days=max(.25,typical*c['capacity_ml']*.8) if typical else 1)
                if c.get('checks'):
                    due = max(due,parse(c['checks'][-1])+dt.timedelta(days=1))
                local_due=due.astimezone(DUBAI).replace(hour=13,minute=30,second=0,microsecond=0)
                last_seen=parse(c['checks'][-1]) if c.get('checks') else start
                if local_due<=last_seen:
                    local_due+=dt.timedelta(days=1)
                due=local_due
                if predicted:due=min(due,predicted-dt.timedelta(hours=6))
                if c.get('levels') and c['levels'][-1]['level']<=10:due=min(due,parse(c['levels'][-1]['at']))
            elif c and c.get('ended_at'):
                due = parse(c['ended_at'])
            inspection=b.get('inspections',[])[-1] if b.get('inspections') else None
            if inspection and (not c or parse(inspection['at'])>=parse(c.get('filled_at') or c['ended_at'])) and inspection['level']<=10:
                due=parse(inspection['at'])
            bottles.append({'id':b['id'],'samples':len(samples),'ml_per_day':round(rate,1) if rate else None,
                'typical_days':round(typical*b['capacity_ml'],1) if typical else None,
                'with_1l_days':round(typical*1000,1) if typical else None,
                'consider_1l':bool(typical and len(samples)>=3 and b['capacity_ml']==750 and typical*750<target_days),
                'estimated_empty_at':predicted.isoformat() if predicted else None,
                'reaches_friday':bool(predicted and predicted>=batch),
                'friday_round':batch.isoformat(),
                'check_at':due.isoformat() if due else None,'due':bool(due and due<=now),
                'confidence':'learning' if len(samples)<3 else 'observed estimate',
                'approximate':any(not s['exact'] for s in samples)})
        rates = [b['ml_per_day'] for b in bottles if b['ml_per_day'] is not None]
        result[pid] = {'bottles':bottles,'ml_per_day':round(sum(rates),1) if rates and len(rates)==len(bottles) else None,
            'target_days':target_days,'due':any(b['due'] for b in bottles)}
        interval=p.get('feed_interval_days');feeds=p.get('feeds',[])
        feed_at=(parse(feeds[-1])+dt.timedelta(days=interval)).astimezone(DUBAI).replace(hour=13,minute=30,second=0,microsecond=0) if interval and feeds else None
        result[pid].update(fertilise_at=feed_at.isoformat() if feed_at else None,
            fertilise_due=bool(feed_at and feed_at<=now and not p.get('quarantine')),
            fertilise_paused=bool(p.get('quarantine')))
    return result

