const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
let handler,registered=0,pushes=[],events=[];
class HTMLElement {attachShadow(){this.shadowRoot={addEventListener:(type,fn)=>{assert.equal(type,'click');handler=fn;registered++;}};}}
const window={location:{pathname:'/plant-map/home',search:''},history:{pushState:(...v)=>pushes.push(v)},dispatchEvent:e=>events.push(e)};
const ctx={HTMLElement,window,CustomEvent:class{constructor(type,options){Object.assign(this,{type},options);}},customElements:{get:()=>undefined,define:(name,klass)=>ctx.Card=klass}};
vm.runInNewContext(readFileSync(__dirname+'/ha-plants-card.js','utf8')+';this.nearby=plantNearby;',ctx);
const card=new ctx.Card();card.setConfig({});card.setConfig({});assert.equal(registered,1);
function click(href,extra={},attrs={}){let prevented=false,stopped=false;const link={matches:s=>s==='a[href]',getAttribute:k=>k==='href'?href:attrs[k],hasAttribute:k=>k in attrs};const e={button:0,composedPath:()=>[{matches:()=>false},link,{}],preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true,...extra};handler(e);return {prevented,stopped};}
assert.deepEqual(click('/plant-map/plant-19'),{prevented:true,stopped:true});
assert.equal(pushes.length,1);assert.equal(pushes[0][2],'/plant-map/plant-19');assert.equal(pushes[0][0].from,'/plant-map/home');
assert.equal(events[0].type,'location-changed');assert.equal(events[0].detail.replace,false);
window.location.pathname='/plant-map/plant-19';click('/plant-map/home');assert.equal(pushes.at(-1)[2],'/plant-map/home');
const count=pushes.length;
for(const [url,event,attrs] of [['https://plants.mungoon.net/plants/details/19',{},{}],['//other.test/plant-map/home',{},{}],['/plant-map/plant-19',{ctrlKey:true},{}],['/plant-map/plant-19',{button:1},{}],['/plant-map/plant-19',{defaultPrevented:true},{}],['/plant-map/home',{}, {target:'_blank'}],['/plant-map/home',{}, {download:''}]])assert.equal(click(url,event,attrs).prevented,false);
assert.equal(pushes.length,count);click('/plant-map/plant-19');assert.equal(pushes.length,count);
// Overlapping Hall and bathroom markers observed at the 390 px phone viewport.
const marker=(id,x,y,w=11.455)=>({id,querySelector:()=>({getBoundingClientRect:()=>({x,y,width:w,height:w})})});
const markers=[marker(8,265.449,312.756),marker(11,265.449,317.938),marker(20,40,700)];
assert.equal(ctx.nearby(markers,271,319).map(m=>m.id).join(','),'8,11');
assert.equal(ctx.nearby(markers,45,705).map(m=>m.id).join(','),'20');
assert.equal(ctx.nearby(markers,0,0).length,0);
console.log('HA navigation passed: nested/SVG links, home, one listener, modifiers, external links, same-page and history/event routing.');
console.log('Map hit areas passed: crowded phone markers produce a choice; isolated and empty areas stay distinct.');

