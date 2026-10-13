const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const window={PlantCamera:require('./plant-camera.js')};
vm.runInNewContext(fs.readFileSync(__dirname+'/ha-plant-map.js','utf8'),{window,clearTimeout,setTimeout});
(async()=>{
 let complete,rendered=0,command;
 const position={x:10,y:20,room:'hall'};
 const host={data:{tracking:{1:{position,last_event:7}}},render(){rendered++;},act(c){command=c;return new Promise(r=>complete=r);}};
 const map=new window.MungoonPlantMap(host);map.draw=()=>{};map.message=()=>{};
 const drop={id:1,position:{x:100,y:150,room:'hall'}};
 const saving=map.save(drop);assert.equal(map.saving,drop);assert.equal(host.data.tracking[1].position,position);
 assert.equal(command.action,'move');host.data.tracking[1].last_event=8;complete(true);await saving;
 assert.equal(map.saving,null);assert.equal(map.lastMove.event,8);
 const undo=map.undo();assert.equal(command.action,'undo');assert.equal(command.event_id,8);complete(true);await undo;assert.equal(map.lastMove,null);
 const rejected=map.save(drop);complete(false);await rejected;assert.equal(map.saving,null);assert.equal(map.lastMove,null);assert.equal(host.data.tracking[1].position,position);
 host.pending={command:{action:'move',plant_id:1,...drop.position}};
 const retry=map.retry();assert.equal(map.saving.id,1);complete(true);await retry;assert.equal(map.saving,null);assert.equal(map.lastMove.id,1);
 map.pointers.set(1,{x:1,y:2});map.drag=drop;map.cancel();assert.equal(map.active,false);assert.equal(map.drag,null);
 assert.ok(rendered>=4);console.log('HA map passed: slow-save position, rejected save, Undo, retry and cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
