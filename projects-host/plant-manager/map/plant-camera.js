/* Same cursor/finger anchoring as Layout Studio and its HA floor-plan card. */
(function(root){
 'use strict';
 const wrap=a=>((a%360)+360)%360;
 function rotate(p,a){const r=a*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return {x:p.x*c-p.y*s,y:p.x*s+p.y*c};}
 function frame(v,width,height){const scale=Math.min(width/v.w,height/v.h);return {scale,left:(width-v.w*scale)/2,top:(height-v.h*scale)/2};}
 function project(p,v,width,height,a=0){p=rotate(p,a);const f=frame(v,width,height);return {x:f.left+(p.x-v.x)*f.scale,y:f.top+(p.y-v.y)*f.scale};}
 function unproject(p,v,width,height,a=0){const f=frame(v,width,height);return rotate({x:(p.x-f.left)/f.scale+v.x,y:(p.y-f.top)/f.scale+v.y},-a);}
 function zoom(v,f,p={x:v.x+v.w/2,y:v.y+v.h/2}){f=Math.min(15000,Math.max(100,v.w*f))/v.w;return {x:p.x-(p.x-v.x)*f,y:p.y-(p.y-v.y)*f,w:v.w*f,h:v.h*f};}
 function pinch(v,width,height,start,end){const anchor=unproject(start,v,width,height),next=zoom(v,start.d>=12&&end.d>=12?start.d/end.d:1,anchor),scale=frame(next,width,height).scale;next.x-=(end.x-start.x)/scale;next.y-=(end.y-start.y)/scale;return next;}
 function gesture(v,a,width,height,start,end){const two=start.d>=12&&end.d>=12,rotation=two?wrap(a+end.angle-start.angle):a,world=unproject(start,v,width,height,a),before=rotate(world,a),after=rotate(world,rotation),view=zoom(v,two?start.d/end.d:1,before),scale=frame(view,width,height).scale;view.x+=after.x-before.x-(end.x-start.x)/scale;view.y+=after.y-before.y-(end.y-start.y)/scale;return {view,rotation};}
 // Photos grow gently with magnification; labels use the independent screen scale.
 function portraitRadius(magnification){return Math.max(18,Math.min(52,21*Math.pow(magnification,.32)));}
 const api={wrap,rotate,frame,project,unproject,zoom,pinch,gesture,portraitRadius};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlantCamera=api;
})(typeof window==='object'?window:globalThis);
