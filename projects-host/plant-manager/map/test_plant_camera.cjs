const assert=require('node:assert/strict');
const C=require('./plant-camera.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// Letterboxed desktop and portrait phone viewports, including non-central anchors.
for(const [width,height] of [[850,730],[360,440],[768,500]]){
 const v={x:-50,y:20,w:1000,h:400},screen={x:width*.27,y:height*.7},world=C.unproject(screen,v,width,height);
 const next=C.zoom(v,.6,world),after=C.project(world,next,width,height);near(after.x,screen.x);near(after.y,screen.y);
 const end={x:screen.x+30,y:screen.y-25,d:180};
 const pinched=C.pinch(v,width,height,{...screen,d:100},end),at=C.project(world,pinched,width,height);near(at.x,end.x);near(at.y,end.y);
 // At zoom limits the fingers still pan without anchor drift.
 const close={...v,w:100,h:40},point=C.unproject(screen,close,width,height),limit=C.pinch(close,width,height,{...screen,d:100},end),out=C.project(point,limit,width,height);near(out.x,end.x);near(out.y,end.y);assert.equal(limit.w,100);
}
assert.equal(C.zoom({x:0,y:0,w:1000,h:500},100).w,15000);
assert.ok(C.portraitRadius(4)>C.portraitRadius(1));assert.ok(C.portraitRadius(100)<=52);assert.ok(C.portraitRadius(.01)>=18);
for(const rotation of [0,90,233]){
 const v={x:-100,y:-200,w:1000,h:600},start={x:150,y:250,d:100,angle:20},end={x:200,y:230,d:160,angle:85},world=C.unproject(start,v,390,600,rotation),next=C.gesture(v,rotation,390,600,start,end),screen=C.project(world,next.view,390,600,next.rotation);
 near(screen.x,end.x);near(screen.y,end.y);near(next.rotation,C.wrap(rotation+65));
 const same=C.unproject(screen,next.view,390,600,next.rotation);near(same.x,world.x);near(same.y,world.y);
}
console.log('Plant camera passed: cursor anchoring, phone/desktop letterboxing, moving pinch centre, zoom limits, gradual bounded photo growth.');
