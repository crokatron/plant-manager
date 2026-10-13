import http.client,json,tempfile,threading,unittest,uuid,sys,datetime as dt
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from server import App,handler,OWNER,ORIGIN,ThreadingHTTPServer
from sync_ha import notification_due
class Fixture:
 def plants(self):return [{'id':1,'name':'Test','photo':None}]
class HttpTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  Path(self.tmp.name,'floor-plan.json').write_text('{"rooms":[]}')
  self.server=ThreadingHTTPServer(('127.0.0.1',0),handler(App(self.tmp.name,Fixture())))
  threading.Thread(target=self.server.serve_forever,daemon=True).start()
  self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
 def req(self,path,headers=None,body=None):
  c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
  c.request('POST' if body else 'GET',path,body,headers or {});r=c.getresponse();data=r.read();c.close();return r.status,data
 def test_auth_and_private_files(self):
  self.assertEqual(self.req('/plant-map/api/state')[0],403)
  self.assertEqual(self.req('/plant-map/api/state',{'X-Mungoon-Email':'wrong'})[0],403)
  for path in ('/plant-map/server.py','/plant-map/../plants.sqlite3','/plant-map/floor-plan.json'):
   self.assertEqual(self.req(path,{'X-Mungoon-Email':OWNER})[0],404)
  self.assertEqual(self.req('/plant-map/api/state',{'X-Mungoon-Email':OWNER})[0],200)
  self.assertEqual(self.req('/plant-map/plant-camera.js')[0],403)
  status,body=self.req('/plant-map/plant-camera.js',{'X-Mungoon-Email':OWNER})
  self.assertEqual(status,200);self.assertIn(b'portraitRadius',body)
 def test_origin_and_write(self):
  body=json.dumps({'request_id':str(uuid.uuid4()),'action':'add_bottle','plant_id':1,'capacity_ml':750})
  headers={'X-Mungoon-Email':OWNER,'Content-Type':'application/json','If-Match':'"0"'}
  self.assertEqual(self.req('/plant-map/api/action',headers,body)[0],403)
  headers['Origin']=ORIGIN
  status,data=self.req('/plant-map/api/action',headers,body);self.assertEqual(status,200);self.assertEqual(json.loads(data)['revision'],1)
 def test_reminder_timing_and_dedup(self):
  state={'plants':[{'id':1}],'forecasts':{'1':{'due':True}},'tracking':{}}
  before=dt.datetime.fromisoformat('2026-10-09T13:29:00+04:00');after=before+dt.timedelta(minutes=1)
  self.assertFalse(notification_due(state,before,None));self.assertEqual(len(notification_due(state,after,None)),1)
  self.assertFalse(notification_due(state,after,'2026-10-09'))
if __name__=='__main__':unittest.main()
