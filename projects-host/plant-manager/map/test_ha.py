import copy,json,sys,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import Mock,patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from ha_dashboard import merge_views
from sync_ha import handle_event,image_upload,latest_photo
from server import Store

class HATests(unittest.TestCase):
 def test_gallery_photo_follows_upload_and_respects_newer_main(self):
  plant={'photo':'/img/main.jpg','photo_updated_at':'2026-10-08 12:00:00'}
  gallery=[{'id':2,'thumb':'new.png','created_at':'2026-10-09 12:00:00'}, {'id':3,'thumb':'archived.jpg','created_at':'2026-10-07 12:00:00'}]
  self.assertEqual(latest_photo(plant,gallery),'/img/new.png')
  plant['photo_updated_at']='2026-10-10 12:00:00'
  self.assertEqual(latest_photo(plant,gallery),'/img/main.jpg')
  self.assertEqual(latest_photo(plant,[{'id':4,'thumb':'https://example.org/a.jpg','created_at':'2026-10-11 12:00:00'}]),'/img/main.jpg')
 def test_new_photo_upload_keeps_format(self):
  bridge=Mock(config={'ha_url':'http://ha'});bridge.token.return_value='private-test-value'
  for photo,mime in [(b'\x89PNG\r\n\x1a\nimage','image/png'),(b'RIFFxxxxWEBPimage','image/webp'),(b'GIF89aimage','image/gif'),(b'\xff\xd8image','image/jpeg')]:
   with patch('sync_ha.urllib.request.urlopen') as opening:
    import io
    opening.return_value.__enter__.return_value=io.BytesIO(b'{"id":"new-photo"}')
    self.assertEqual(image_upload(bridge,photo),'/api/image/serve/new-photo/512x512')
    self.assertIn(('Content-Type: '+mime).encode(),opening.call_args.args[0].data)
 def test_preserve_unrelated_views_and_cards(self):
  original={'title':'My plants','views':[{'path':'other','cards':[{'type':'markdown','content':'keep'}]}]}
  a=merge_views(original,[{'id':1,'name':'Plant'}]);a['views'][2]['cards'].append({'type':'markdown','content':'notes'})
  b=merge_views(a,[{'id':1,'name':'Renamed'}])
  self.assertEqual(b['views'][0],original['views'][0]);self.assertEqual(b['views'][2]['cards'][-1]['content'],'notes');self.assertEqual(b['views'][2]['title'],'Renamed')
  self.assertEqual(len(original['views']),1)
 def test_collision_does_not_mutate(self):
  a={'views':[{'path':'plant-1','cards':[]}]};before=copy.deepcopy(a)
  with self.assertRaises(ValueError):merge_views(a,[{'id':1,'name':'Plant'}])
  self.assertEqual(a,before)
 def test_owner_context_and_retry(self):
  with tempfile.TemporaryDirectory() as folder:
   store=Store(folder);app=Mock(store=store,floor={'rooms':[]});app.state.side_effect=lambda:{'plants':[{'id':1}]}
   bridge=Mock();bridge.ha.side_effect=lambda path,*args:{'attributes':{}} if not args else None
   event={'context':{'user_id':'other'},'data':{'revision':0,'command':{'plant_id':1,'request_id':str(uuid.uuid4()),'action':'add_bottle','capacity_ml':750}}}
   handle_event(app,bridge,event,'owner');self.assertEqual(store.snapshot()['revision'],0);bridge.ha.assert_not_called()
   event['context']['user_id']='owner';handle_event(app,bridge,event,'owner');handle_event(app,bridge,event,'owner')
   self.assertEqual(store.snapshot()['revision'],1);self.assertEqual(len(store.snapshot()['tracking']['1']['bottles']),1)
   self.assertTrue(bridge.ha.call_args.args[1]['ok'])

if __name__=='__main__':unittest.main()
