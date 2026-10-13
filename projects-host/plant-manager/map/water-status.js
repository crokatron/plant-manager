/* Display estimates only: never invent or write a bottle observation. */
(function(root){
 'use strict';
 const DAY=86400000, colours={green:'#4dcc79',yellow:'#efc34e',red:'#ed6664'};
 const time=v=>v?Date.parse(v):NaN;
 const clamp=v=>Math.max(0,Math.min(1,v));
 function colour(risk){const stops=[[77,204,121],[239,195,78],[237,102,100]],i=risk<.5?0:1,t=i?2*risk-1:2*risk;return '#'+stops[i].map((v,n)=>Math.round(v+(stops[i+1][n]-v)*t).toString(16).padStart(2,'0')).join('');}
 function bottle(b,f={},now=Date.now()){
  const c=b.cycles?.at(-1),fill=time(c?.filled_at),inspection=b.inspections?.at(-1),it=time(inspection?.at);
  const observed=Number.isFinite(it)&&(!Number.isFinite(fill)||it>=fill);
  let level=observed?inspection.level:Number.isFinite(fill)?100:null,at=observed?it:fill;
  if(c?.ended_at&&(!observed||it<=time(c.ended_at)))return {risk:1,reason:'Bottle empty',level:0};
  if(level===0)return {risk:1,reason:'Bottle empty',level:0};
  if(!Number.isFinite(level)||!Number.isFinite(at)||at>now+60000)return {risk:1,reason:'Water status unknown',level:null};
  const checks=(c?.checks||[]).map(time).filter(t=>Number.isFinite(t)&&t<=now&&t>=at),last=Math.max(at,...checks),age=Math.max(0,(now-last)/DAY);
  const rate=Number(f.ml_per_day),capacity=Number(b.capacity_ml),empty=time(f.estimated_empty_at);
  let predicted=level,known=false;
  if(rate>0&&capacity>0){predicted=Math.max(0,level-(now-at)/DAY*rate/capacity*100);known=true;}
  else if(Number.isFinite(empty)&&empty>at){predicted=Math.max(0,level*(empty-now)/(empty-at));known=true;}
  // A later positive check invalidates a passed estimate but gives no new quantity.
  if(known&&predicted<=0&&last>at&&(!Number.isFinite(empty)||last>=empty)&&checks.length)return {risk:.5+clamp(age/4)*.5,reason:'Water seen; estimate needs a new level',level:null};
  if(known&&predicted<=0)return {risk:1,reason:'Predicted empty · check now',level:0};
  const waterRisk=predicted<=25?.5+(25-predicted)/50:Math.max(0,(60-predicted)/70);
  // With no learned rate, colour ages as confidence, not as invented water use.
  const ageRisk=known?0:clamp(age/4);
  const risk=Math.max(waterRisk,ageRisk);
  return {risk,level:known?Math.round(predicted):level,reason:risk>=1?'Inspection overdue · status unknown':risk>=.5?(predicted<=25?'Water low · check soon':'Inspection getting old · check water'):(known?'Water available · estimated '+Math.round(predicted)+'%':'Checked · water available')};
 }
 function plant(a,p,now=Date.now()){
  const t=a.tracking?.[p.id]||{},f=a.forecasts?.[p.id]||{};
  const rows=(t.bottles||[]).map(b=>bottle(b,f.bottles?.find(x=>x.id===b.id),now));
  let result=rows.length?rows.reduce((a,b)=>a.risk>=b.risk?a:b):{risk:1,reason:'Water status unknown · no bottle readings',level:null};
  if(t.quarantine)result={risk:1,reason:'CODE RED · quarantine',level:result.level};
  const risk=clamp(result.risk),state=risk>=1?'red':risk>=.5?'yellow':'green';
  return {...result,risk,state,colour:colour(risk)};
 }
 const api={plant,bottle,colour,colours};root.PlantWaterStatus=api;if(typeof module==='object')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
