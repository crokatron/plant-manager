import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
import uuid
from server import Store, Conflict, new_plant
from forecast import forecasts, friday_round

NOW=dt.datetime(2026,10,8,12,tzinfo=dt.timezone.utc)
ROOMS=[{'id':'den','points':[[0,0],[100,0],[100,100],[0,100]]}]
class StoreTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.store=Store(self.tmp.name)
 def act(self,action,**values):
  c={'request_id':str(uuid.uuid4()),'plant_id':1,'action':action,**values}
  return self.store.apply(c,str(self.store.snapshot()['revision']),{1},ROOMS,NOW)
 def bottle(self,size=750):self.act('add_bottle',capacity_ml=size)
 def test_no_assumed_bottles(self):self.assertEqual(new_plant()['bottles'],[])
 def test_independent_bottles(self):
  self.bottle();self.bottle(1000)
  self.act('refill',bottle_id='b1',capacity_ml=750,at='2026-10-01T12:00:00Z')
  self.act('refill',bottle_id='b2',capacity_ml=1000,at='2026-10-02T12:00:00Z')
  state=self.act('empty_refill',bottle_id='b1',capacity_ml=1000,at=NOW.isoformat())
  a,b=state['tracking']['1']['bottles'];self.assertEqual(a['cycles'][0]['end_reason'],'empty');self.assertIsNone(b['cycles'][0]['ended_at']);self.assertEqual(a['capacity_ml'],1000)
 def test_retry_is_idempotent(self):
  c={'request_id':str(uuid.uuid4()),'plant_id':1,'action':'add_bottle','capacity_ml':750}
  a=self.store.apply(c,'0',{1},ROOMS,NOW);b=self.store.apply(c,'0',{1},ROOMS,NOW);self.assertEqual(a,b)
  c['capacity_ml']=1000
  with self.assertRaises(Conflict):self.store.apply(c,'1',{1},ROOMS,NOW)
 def test_stale_and_invalid(self):
  self.bottle()
  with self.assertRaises(Conflict):self.store.apply({'request_id':str(uuid.uuid4()),'plant_id':1,'action':'profile'},'0',{1},ROOMS,NOW)
  with self.assertRaises(ValueError):self.act('move',room='den',x=500,y=0)
  with self.assertRaises(ValueError):self.act('move',room='den',x=float('nan'),y=0)
  with self.assertRaises(ValueError):self.act('refill',bottle_id='b1',capacity_ml=750,at='2027-01-01T00:00:00Z')
 def test_undo_and_persistence(self):
  self.bottle();a=self.act('move',room='den',x=50,y=50)
  b=self.act('undo',event_id=a['tracking']['1']['last_event']);self.assertIsNone(b['tracking']['1']['position']);self.assertEqual(Store(self.tmp.name).snapshot(),b)
 def test_replacement_not_consumption(self):
  self.bottle();self.act('refill',bottle_id='b1',capacity_ml=750,at='2026-10-01T12:00:00Z')
  self.act('refill',bottle_id='b1',capacity_ml=750,at=NOW.isoformat(),replace_active=True)
  f=forecasts(self.store.snapshot()['tracking'],NOW)['1']['bottles'][0];self.assertEqual(f['samples'],0)
 def test_check_and_backdating(self):
  self.bottle();self.act('refill',bottle_id='b1',capacity_ml=750,at='2026-10-01T12:00:00Z');s=self.act('check',bottle_id='b1',at=NOW.isoformat())
  self.assertFalse(forecasts(s['tracking'],NOW)['1']['due'])
  with self.assertRaises(ValueError):self.act('empty',bottle_id='b1',at='2026-10-07T12:00:00Z')
 def test_prediction_and_room_change(self):
  self.bottle();self.act('refill',bottle_id='b1',capacity_ml=750,at='2026-10-01T12:00:00Z');s=self.act('empty_refill',bottle_id='b1',capacity_ml=1000,at=NOW.isoformat())
  f=forecasts(s['tracking'],NOW)['1']['bottles'][0];self.assertEqual(f['typical_days'],9.3);self.assertTrue(f['approximate']);self.assertFalse(f['consider_1l'])
  s=self.act('move',room='den',x=50,y=50);self.assertEqual(forecasts(s['tracking'],NOW)['1']['bottles'][0]['samples'],0)
 def test_friday(self):
  f=friday_round(NOW);self.assertEqual(f.weekday(),4);self.assertEqual((f.hour,f.minute),(13,30));self.assertGreater(friday_round(f),f)

class InspectionTests(StoreTests):
 def test_levels_do_not_invent_refills(self):
  self.bottle();s=self.act('level',bottle_id='b1',level=50,at=NOW.isoformat())
  self.assertEqual(s['tracking']['1']['bottles'][0]['cycles'],[])
  with self.assertRaises(Conflict):self.act('level',bottle_id='b1',level=100,at=NOW.isoformat())
 def test_level_prediction(self):
  self.bottle();self.act('refill',bottle_id='b1',capacity_ml=750,at='2026-10-01T12:00:00Z')
  s=self.act('level',bottle_id='b1',level=50,at='2026-10-06T12:00:00Z')
  f=forecasts(s['tracking'],NOW)['1']['bottles'][0]
  self.assertEqual(f['ml_per_day'],75);self.assertEqual(parse_date(f['estimated_empty_at']).day,11)
 def test_quarantine_and_feed(self):
  self.act('feed_schedule',days=7)
  s=self.act('fertilised',at='2026-09-25T12:00:00Z');self.assertTrue(forecasts(s['tracking'],NOW)['1']['fertilise_due'])
  s=self.act('pests',notes='Inspect undersides');self.assertTrue(s['tracking']['1']['quarantine']);self.assertFalse(forecasts(s['tracking'],NOW)['1']['fertilise_due'])
  s=self.act('clear_quarantine');self.assertTrue(forecasts(s['tracking'],NOW)['1']['fertilise_due'])

def parse_date(value):return dt.datetime.fromisoformat(value)
if __name__=='__main__':unittest.main()
