(() => {

'use strict';

const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let state=null, selected=null, filter='all', moving=null, pendingPosition=null, busy=false, eventAction=null, eventBottle=null, view=null, fullView=null;

const pointers=new Map();let gesture=null;

const Camera=window.PlantCamera;let mapGroups=[];const groupStyle=document.createElement('style');groupStyle.textContent=window.PlantClusters.css;document.head.append(groupStyle);

let editing=false,dragging=null,savingDrop=null,lastMove=null,rotation=0,space=false,holdTimer=null;

const blank=()=>({position:null,notes:'',bottles:[],moves:[],last_event:null});

const track=id=>state.tracking[String(id)]||blank();

const plant=()=>state.plants.find(p=>p.id===selected);

const last=p=>p.cycles.at(-1);

const bottleState=p=>p.bottles?(p.bottles.some(b=>bottleState(b)==='empty')?'empty':p.bottles.some(b=>bottleState(b)==='active')?'active':'untracked'):!last(p)?'untracked':last(p).ended_at?'empty':'active';

const roomName=id=>state.floor.rooms.find(r=>r.id===id)?.name||'Not on map';

const size=ml=>ml===1000?'1 L':'750 ml';

const days=(a,b)=>Math.max(0,(new Date(b)-new Date(a))/86400000);

const age=at=>{const n=days(at,new Date());return n<1?`${Math.floor(n*24)} hours`:`${n.toFixed(1)} days`;};

const date=at=>at?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(at)):'Start not recorded';

function picture(p){const ring=window.PlantWaterStatus.plant(state,p).colour;return p.photo?`<img class="plant-thumb" style="border:4px solid ${ring};box-sizing:border-box;border-radius:50%" src="${esc(p.photo)}" alt="" loading="lazy">`:'<span class="plant-thumb plant-placeholder" aria-hidden="true">♧</span>';}

function statusText(p){if(p.bottles){const empty=p.bottles.filter(b=>bottleState(b)==='empty').length;return empty?`${empty} of ${p.bottles.length} bottles empty`:`${p.bottles.length} bottles · ${p.bottles.filter(b=>bottleState(b)==='active').length} in use`;}const c=last(p);return !c?'Not tracked yet':c.ended_at?'Found empty':`${size(c.capacity_ml)} · ${age(c.filled_at)} in use`;}

function message(text,error=false){for(const id of ['status','map-feedback']){$(id).textContent=text;$(id).classList.toggle('error',error);}}

async function load(){if(busy||dragging||pointers.size)return;try{const response=await fetch('/plant-map/api/state',{cache:'no-store'});const value=await response.json();if(!response.ok)throw Error(value.error);state=value;if(!view){fullView=bounds(state.floor.rooms.flatMap(r=>r.points));view={...fullView};}render();message('Saved on NAS · Last refreshed '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}));}catch(e){message(e.message||'Could not load your plant collection.',true);}}

async function send(command){if(busy)return false;busy=true;const body=JSON.stringify({...command,request_id:crypto.randomUUID()});message('Saving to NAS…');try{

 let response;for(let attempt=0;attempt<2;attempt++){try{response=await fetch('/plant-map/api/action',{method:'POST',headers:{'Content-Type':'application/json','If-Match':`"${state.revision}"`},body});break;}catch(e){if(attempt)throw e;}}

 const value=await response.json();if(!response.ok)throw Error(value.error||'Could not save. Refresh and try again.');state={...state,...value};render();message('Saved on NAS');return true;

 }catch(e){message(e.message||'Save response lost. Refresh to check the latest record.',true);throw e;}finally{busy=false;}}

function render(){

 const all=state.plants,empty=all.reduce((n,p)=>n+track(p.id).bottles.filter(b=>bottleState(b)==='empty').length,0),placed=all.filter(p=>track(p.id).position).length;

 $('stats').innerHTML=`<div class="stat"><strong>${all.length}</strong><span>plants</span></div><div class="stat"><strong>${placed}</strong><span>on the map</span></div><div class="stat"><strong>${empty}</strong><span>empty bottles</span></div>`;

 $('plant-count').textContent=`(${all.length})`;

 const current=$('room-view').value;$('room-view').innerHTML='<option value="">Whole home</option>'+state.floor.rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');$('room-view').value=current;

 const query=$('search').value.trim().toLowerCase();

 const list=all.filter(p=>{const t=track(p.id);return(filter!=='empty'||bottleState(t)==='empty')&&(filter!=='unplaced'||!t.position)&&`${p.name} ${p.scientific_name} ${roomName(t.position?.room)}`.toLowerCase().includes(query);}).sort((a,b)=>a.name.localeCompare(b.name));

 $('plant-list').innerHTML=list.length?list.map(p=>{const t=track(p.id);return`<button class="plant-row" data-plant="${p.id}">${picture(p)}<span class="plant-info"><strong>${esc(p.name)}</strong><small>#${p.id} · ${esc(roomName(t.position?.room))}</small><span class="badge" style="border:1px solid ${window.PlantWaterStatus.plant(state,p).colour}">${esc(window.PlantWaterStatus.plant(state,p).reason)}</span></span><span class="plant-arrow">›</span></button>`;}).join(''):`<div class="empty-state"><strong>${all.length?'No matching plants':'Your plant map starts here'}</strong>${all.length?'Try another search or filter.':'Add your plants and photos to the collection, then place them here.'}</div>`;

 $('plant-list').querySelectorAll('[data-plant]').forEach(b=>b.addEventListener('click',()=>openPlant(Number(b.dataset.plant))));

 $('map-empty').hidden=placed>0||moving!==null;

 renderInsights();drawMap();if($('plant-dialog').open&&plant())renderDetail();

}

function openPlant(id){clearTimeout(holdTimer);selected=id;renderDetail();$('plant-dialog').showModal();}

function renderDetail(){const p=plant(),t=track(selected);if(!p)return;

 $('plant-heading').innerHTML=`<div class="detail-heading">${picture(p)}<div><h2>${esc(p.name)}</h2><small>${esc(p.scientific_name)}<br>#${p.id} · ${esc(roomName(t.position?.room))}</small></div></div>`;

 $('native-record').href='/plants/details/'+p.id;$('move-plant').textContent=t.position?'Move on map':'Place on map';

 $('bottle-summary').innerHTML=t.bottles.length?t.bottles.map((b,i)=>{const c=last(b),f=state.forecasts?.[selected]?.bottles.find(x=>x.id===b.id);return `<section class="bottle-card"><strong>Bottle ${i+1} · ${size(b.capacity_ml)}</strong><p>${esc(statusText(b))}</p><p>${f?.estimated_empty_at?'Estimated empty: '+date(f.estimated_empty_at):'Learning from your refill and empty records'}<br>${f?.check_at?'Next check: '+date(f.check_at):'Log a refill to schedule checks.'}</p>${f?.samples?`<small>${f.samples} completed cycles · about ${f.ml_per_day} ml/day${f.approximate?' (empty-check estimate)':''}</small>`:''}${f?.consider_1l?`<p>Consider 1 L: estimated ${f.with_1l_days} days per bottle, toward a ${state.forecasts[selected].target_days}-day refill round.</p>`:''}<div class="bottle-actions"><button data-bottle="${b.id}" data-action="empty_refill" class="primary">Empty & refilled</button><button data-bottle="${b.id}" data-action="refill">Refilled / topped up</button><button data-bottle="${b.id}" data-action="empty" ${c?.ended_at?'disabled':''}>Found empty</button><button data-bottle="${b.id}" data-action="check" ${!c||c.ended_at?'disabled':''}>Still has water</button></div></section>`;}).join(''):'<p>No bottles configured. Add only the bottles this plant actually uses.</p>';

 $('bottle-summary').querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>showEvent(b.dataset.action,b.dataset.bottle));

 $('notes').value=t.notes;$('undo').disabled=!t.last_event;$('detail-error').textContent='';

 const cycles=t.bottles.flatMap((b,i)=>b.cycles.map(c=>({...c,bottle:i+1}))).sort((a,b)=>(b.filled_at||b.ended_at).localeCompare(a.filled_at||a.ended_at));

 $('bottle-history').innerHTML=cycles.length?cycles.map(c=>`<div class="history-row"><strong>Bottle ${c.bottle} · ${size(c.capacity_ml)} · ${!c.ended_at?'In use':c.end_reason==='replaced'?'Replaced / topped up':c.exact?'Ran empty':'Found empty'}</strong><span>${date(c.filled_at)}${c.ended_at?' → '+date(c.ended_at):''}</span>${c.filled_at&&c.ended_at&&c.end_reason==='empty'?`<em>${c.exact?'Lasted':'Empty at check after'} ${days(c.filled_at,c.ended_at).toFixed(1)} days</em>`:''}${c.checks?.length?`<small>Last seen with water: ${date(c.checks.at(-1))}</small>`:''}</div>`).join(''):'<p class="empty-state">No bottle history yet.</p>';

 $('move-history').innerHTML=t.moves.length?[...t.moves].reverse().map(m=>`<div class="history-row"><strong>${esc(roomName(m.room))}</strong><span>${date(m.at)}</span></div>`).join(''):'<p>No map placement recorded.</p>';

}

function renderInsights(){

 const rows=state.plants.map(p=>({p,f:state.forecasts?.[p.id]}));

 const due=rows.flatMap(({p,f})=>(f?.bottles||[]).filter(b=>b.check_at).map(b=>({p,b}))).sort((a,b)=>a.b.check_at.localeCompare(b.b.check_at));

 $('check-list').innerHTML=due.length?due.map(({p,b})=>`<button class="schedule-row" data-plant="${p.id}"><strong>${esc(p.name)} · Bottle ${b.id.slice(1)}</strong><span>${b.due?'Check due · ':''}${date(b.check_at)}</span></button>`).join(''):'<p>Log your first refills to start daily learning checks. Forecasts adapt as completed bottles are recorded.</p>';

 $('check-list').querySelectorAll('[data-plant]').forEach(b=>b.onclick=()=>openPlant(Number(b.dataset.plant)));

 const ranked=rows.filter(x=>x.f?.ml_per_day!=null).sort((a,b)=>b.f.ml_per_day-a.f.ml_per_day);

 $('water-ranking').innerHTML=ranked.length?ranked.map(({p,f})=>`<div class="history-row"><strong>${esc(p.name)}</strong><span>About ${f.ml_per_day} ml/day across ${f.bottles.length} bottles</span></div>`).join(''):'<p>Water-use comparisons appear after each configured bottle has a completed cycle.</p>';

}

function bounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,pad=Math.max(w,h)*.06;return{x:x-pad,y:y-pad,w:Math.max(10,w+pad*2),h:Math.max(10,h+pad*2)};}

function drawMap(){if(!state||!view)return;const svg=$('map');svg.classList.toggle('editing',editing);svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);const scale=Math.max(view.w/Math.max(svg.clientWidth,1),view.h/Math.max(svg.clientHeight,1)),r=Camera.portraitRadius(fullView.w/view.w)*scale;

 let markup=`<g transform="rotate(${rotation})">`+state.floor.rooms.map(room=>`<polygon class="room-shape ${$('room-view').value===room.id?'selected':''}" points="${room.points.map(p=>p.join(',')).join(' ')}"/>`).join('');

 markup+=(state.floor.walls||[]).map(w=>`<line class="wall" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}"/>`).join('');

 markup+='</g>'+state.floor.rooms.map(room=>{const b=bounds(room.points),q=Camera.rotate({x:room.label?.[0]??b.x+b.w/2,y:room.label?.[1]??b.y+b.h/2},rotation);return `<text class="room-label" x="${q.x}" y="${q.y}" font-size="${11*scale}">${esc(room.name)}</text>`;}).join('');

 const groupItems=state.plants.flatMap(p=>{const pos=track(p.id).position;return pos&&p.id!==moving&&p.id!==dragging?.id&&p.id!==savingDrop?.id?[{id:p.id,plant:p,...Camera.rotate(pos,rotation)}]:[];});mapGroups=editing||moving?[]:window.PlantClusters.layout(groupItems,2*r+14*scale);const grouped=new Set(mapGroups.filter(g=>g.items.length>1).flatMap(g=>g.items.map(p=>p.id)));markup+=mapGroups.filter(g=>g.items.length>1).map(g=>window.PlantClusters.svg(g,r,scale,'web',p=>window.PlantWaterStatus.plant(state,p))).join('');
 for(const p of state.plants){const t=track(p.id),pos=t.position;if(!pos||p.id===moving||p.id===dragging?.id||p.id===savingDrop?.id||grouped.has(p.id))continue;markup+=marker(p,pos,r,bottleState(t),scale);}

 if(savingDrop)markup+=marker(state.plants.find(p=>p.id===savingDrop.id),savingDrop.position,r,'pending',scale);

 if(dragging)markup+=marker(state.plants.find(p=>p.id===dragging.id),dragging.position,r,'pending',scale);

 if(moving&&pendingPosition)markup+=marker(state.plants.find(p=>p.id===moving),pendingPosition,r,'pending',scale);

 svg.innerHTML=markup;if(document.activeElement!==$('map-angle'))$('map-angle').value=Math.round(rotation);$('map-zoom').textContent=Math.round(fullView.w/view.w*100)+'%';

 svg.querySelectorAll('[data-plant-group]').forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openGroup(el.dataset.plantGroup);}}));
 svg.querySelectorAll('[data-plant]').forEach(el=>el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)openPlant(Number(el.dataset.plant));}}));

}

function openGroup(key){const g=mapGroups.find(g=>g.key===key);if(!g||busy)return;const d=document.createElement('dialog');d.className='plant-group-dialog';d.innerHTML=`<form method="dialog"><button class="plant-group-close" aria-label="Close dialog">×</button></form><h2>${g.items.length} nearby plants</h2>${window.PlantClusters.choices(g.items,p=>window.PlantWaterStatus.plant(state,p),p=>roomName(track(p.id).position?.room))}`;d.addEventListener('close',()=>d.remove());document.body.append(d);d.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{d.close();openPlant(Number(b.dataset.choice));});d.showModal();}

function marker(p,pos,r,kind,s){const water=window.PlantWaterStatus.plant(state,p);pos=Camera.rotate(pos,rotation);const name=p.name.split(' · ')[0],label=name.length>26?name.slice(0,25)+'…':name,w=Math.max(70,Math.min(190,label.length*6.7))*s;return`<g class="marker ${kind} ${p.photo?'has-photo':'no-photo'} ${selected===p.id?'selected':''}" data-plant="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}" transform="translate(${pos.x},${pos.y})"><title>${esc(p.name)} · ${esc(water.reason)}</title><circle r="${r+3*s}" class="hit"/><circle r="${r}" style="fill:${water.colour};stroke:${water.colour};stroke-width:4;vector-effect:non-scaling-stroke"/>${p.photo?`<defs><clipPath id="portrait-${p.id}"><circle r="${r-2*s}"/></clipPath></defs><image href="${esc(p.photo)}" x="${-r}" y="${-r}" width="${2*r}" height="${2*r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait-${p.id})" pointer-events="none"/>`:`<text font-size="${r}">♧</text>`}<g class="marker-name"><rect x="${-w/2}" y="${r+5*s}" width="${w}" height="${24*s}" rx="${5*s}"/><text y="${r+17*s}" font-size="${11*s}">${esc(label)}</text></g></g>`;}

function editMode(value){if(busy)return;editing=value;if(moving)endPlacement();$('edit-map').textContent=editing?'Done editing':'Edit placements';$('edit-map').setAttribute('aria-pressed',String(editing));$('edit-help').textContent=editing?'Drag a photo to move it · Click for plant info · Each drop saves automatically. Choose a room for more space, or Fit home to move between rooms.':'Click a plant photo to see its information.';if(editing&&!$('room-view').value){const room=state.floor.rooms.find(r=>r.id===track(selected).position?.room)||state.floor.rooms.find(r=>state.plants.some(p=>track(p.id).position?.room===r.id));if(room){$('room-view').value=room.id;view=roomBounds(room);}}drawMap();}

function inside(p,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[a,b]=polygon[i],[c,d]=polygon[j];if((b>p.y)!==(d>p.y)&&p.x<(c-a)*(p.y-b)/(d-b)+a)hit=!hit;}return hit;}

function viewportPoint(event){const p=$('map').createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform($('map').getScreenCTM().inverse());}

function mapPoint(event){return Camera.rotate(viewportPoint(event),-rotation);}

function zoom(factor,anchor){view=Camera.zoom(view,factor,anchor);drawMap();}

function touchPair(points){const a=points[0],b=points[1];return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}:{...a,d:0,angle:0};}

function rotatedBounds(points){return bounds(points.map(p=>{const q=Camera.rotate({x:p[0],y:p[1]},rotation);return [q.x,q.y];}));}

function roomBounds(room){return rotatedBounds(room.points);}

function fitMap(){if(!state)return;const room=state.floor.rooms.find(r=>r.id===$('room-view').value);view=room?roomBounds(room):rotatedBounds(state.floor.rooms.flatMap(r=>r.points));drawMap();}

function rotateMap(angle){if(!view||pointers.size)return;rotation=Camera.wrap(angle);fitMap();}

function panel(name){document.body.dataset.panel=name;document.querySelectorAll('[data-panel-button]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panelButton===name)));drawMap();}

function cancelGesture(){clearTimeout(holdTimer);pointers.clear();gesture=null;dragging=null;drawMap();}

function endPlacement(){moving=null;pendingPosition=null;$('placement').hidden=true;$('place-confirm').disabled=true;render();}

function startMove(){const p=plant();moving=selected;$('map-empty').hidden=true;pendingPosition=track(selected).position?{...track(selected).position}:null;$('plant-dialog').close();$('placement').hidden=false;$('placement-title').textContent='Place '+p.name;$('place-confirm').disabled=!pendingPosition;panel('map');$('map-stage').scrollIntoView({block:'center',behavior:'smooth'});drawMap();}

function showEvent(action,bottleId){eventAction=action;eventBottle=bottleId;const b=track(selected).bottles.find(b=>b.id===bottleId),c=last(b);const titles={refill:'Refilled / topped up',empty:'Found empty',empty_refill:'Empty & refilled',check:'Still has water'};$('event-title').textContent=titles[action]+' · Bottle '+bottleId.slice(1);$('event-help').textContent=action==='empty_refill'?'Record when you found this bottle empty and refilled it. This completes the old cycle and starts the next one.':action==='check'?'This check keeps the current cycle running and moves the next check forward.':action==='refill'?'Record the refill. Replacing a bottle that still has water will not count as a completed empty cycle.':'Record when you checked and found the bottle empty.';$('event-capacity').value=b.capacity_ml;$('event-capacity-label').hidden=!['refill','empty_refill'].includes(action);$('exact-label').hidden=action!=='empty';$('exact').checked=false;$('replace-label').hidden=action!=='refill'||!c||Boolean(c.ended_at);$('replace').checked=false;$('event-time').value=new Date(Date.now()+4*3600000).toISOString().slice(0,16);$('event-error').textContent='';$('event-dialog').showModal();}

$('refresh').onclick=load;$('search').addEventListener('input',()=>state&&render());

$('edit-map').onclick=()=>state&&editMode(!editing);

$('undo-map').onclick=async()=>{if(!lastMove||busy)return;try{if(await send({action:'undo',plant_id:lastMove.id,event_id:lastMove.event})){lastMove=null;$('undo-map').hidden=true;message('Move undone.');}}catch(e){message(e.message,true);}};

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));if(state)render();});

$('room-view').onchange=()=>{const room=state.floor.rooms.find(r=>r.id===$('room-view').value);fitMap();};

$('fit').onclick=()=>{$('room-view').value='';fitMap();};$('zoom-in').onclick=()=>view&&zoom(.8);$('zoom-out').onclick=()=>view&&zoom(1.25);

$('move-plant').onclick=startMove;$('place-cancel').onclick=endPlacement;$('place-confirm').onclick=async()=>{if(!pendingPosition)return;try{if(await send({action:'move',plant_id:moving,...pendingPosition})){const id=moving;endPlacement();openPlant(id);}}catch(e){message(e.message,true);}};

$('save-profile').onclick=async()=>{try{await send({action:'profile',plant_id:selected,notes:$('notes').value});}catch(e){$('detail-error').textContent=e.message;}};

$('add-bottle').onclick=async()=>{try{await send({action:'add_bottle',plant_id:selected,capacity_ml:Number($('new-bottle-size').value)});}catch(e){$('detail-error').textContent=e.message;}};$('event-cancel').onclick=()=>$('event-dialog').close();

$('event-form').onsubmit=async event=>{event.preventDefault();$('event-save').disabled=true;try{const ok=await send({action:eventAction,plant_id:selected,bottle_id:eventBottle,at:new Date($('event-time').value+'+04:00').toISOString(),capacity_ml:Number($('event-capacity').value),exact:$('exact').checked,replace_active:$('replace').checked});if(ok)$('event-dialog').close();}catch(e){$('event-error').textContent=e.message;}finally{$('event-save').disabled=false;}};

$('undo').onclick=async()=>{try{await send({action:'undo',plant_id:selected,event_id:track(selected).last_event});}catch(e){$('detail-error').textContent=e.message;}};

$('rotate-left').onclick=()=>rotateMap(rotation-15);$('rotate-right').onclick=()=>rotateMap(rotation+15);$('map-reset').onclick=()=>rotateMap(0);$('map-angle').oninput=$('map-angle').onchange=event=>{const value=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(value))rotateMap(value);};

document.querySelectorAll('[data-panel-button]').forEach(b=>b.onclick=()=>panel(b.dataset.panelButton));

$('gestures').onclick=()=>$('gesture-dialog').showModal();

$('map').addEventListener('pointerdown',event=>{

 if(!view||busy||event.button>1)return;event.preventDefault();clearTimeout(holdTimer);

 const marker=event.target.closest('[data-plant]'),pan=space||event.button===1;

 pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});$('map').setPointerCapture(event.pointerId);

 if(pointers.size>1){if(dragging)message('Plant move cancelled. Two fingers move the map.');dragging=null;drawMap();}

 else if(marker&&editing&&!moving&&!pan){const id=Number(marker.dataset.plant),pos=track(id).position,p=mapPoint(event);selected=id;dragging={id,position:{...pos},offset:{x:pos.x-p.x,y:pos.y-p.y},moved:false};}

 gesture={start:{x:event.clientX,y:event.clientY},view:{...view},rotation,points:[...pointers.values()],moved:pointers.size>1,pan,group:!moving&&!pan?event.target.closest('[data-plant-group]')?.dataset.plantGroup:null,plant:marker&&!moving&&!pan?Number(marker.dataset.plant):null};

 if(event.pointerType==='touch'&&gesture.plant&&pointers.size===1){const id=gesture.plant;holdTimer=setTimeout(()=>{if(gesture&&!gesture.moved&&!dragging?.moved&&pointers.size===1){cancelGesture();openPlant(id);}},650);}

});

$('map').addEventListener('pointermove',event=>{

 if(!pointers.has(event.pointerId)||!gesture)return;event.preventDefault();pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});

 if(dragging){if(Math.hypot(event.clientX-gesture.start.x,event.clientY-gesture.start.y)>6)dragging.moved=true;if(dragging.moved){clearTimeout(holdTimer);const p=mapPoint(event);dragging.position={x:p.x+dragging.offset.x,y:p.y+dragging.offset.y};const room=state.floor.rooms.find(r=>inside(dragging.position,r.points));dragging.position.room=room?.id;message(room?'Release to place in '+room.name:'Keep the plant inside a room.',!room);drawMap();}return;}

 const points=[...pointers.values()],start=touchPair(gesture.points),end=touchPair(points),twist=Math.abs(Camera.wrap(end.angle-start.angle+180)-180);

 if(!gesture.moved&&Math.hypot(end.x-start.x,end.y-start.y)<5&&Math.abs(end.d-start.d)<5&&twist<2)return;

 clearTimeout(holdTimer);gesture.moved=true;const rect=$('map').getBoundingClientRect(),local=p=>({...p,x:p.x-rect.left,y:p.y-rect.top}),next=Camera.gesture(gesture.view,gesture.rotation,rect.width,rect.height,local(start),local(end));view=next.view;rotation=next.rotation;drawMap();

});

async function pointerEnd(event){

 clearTimeout(holdTimer);if(!pointers.has(event.pointerId))return;

 const wasTap=gesture&&!gesture.moved&&!gesture.pan&&pointers.size===1,id=gesture?.plant,group=gesture?.group,drop=dragging;

 pointers.delete(event.pointerId);dragging=null;if($('map').hasPointerCapture(event.pointerId))$('map').releasePointerCapture(event.pointerId);

 if(drop?.moved){
  gesture=null;
  if(!drop.position.room){drawMap();message('Move cancelled: drop inside a room.',true);return;}
  // Keep the dropped portrait visible until the NAS confirms or rejects it.
  // Persistent state remains untouched until send() receives the saved record.
  savingDrop=drop;drawMap();
  try{if(await send({action:'move',plant_id:drop.id,...drop.position})){lastMove={id:drop.id,event:track(drop.id).last_event};$('undo-map').hidden=false;message('Placement saved · '+roomName(drop.position.room));}}
  catch(e){/* send() presents the failure; finally restores the confirmed position. */}
  finally{savingDrop=null;drawMap();}
  return;
 }

 if(wasTap&&moving){const p=mapPoint(event),room=state.floor.rooms.find(r=>inside(p,r.points));if(room){pendingPosition={room:room.id,x:p.x,y:p.y};$('place-confirm').disabled=false;$('placement-title').textContent='Place '+state.plants.find(p=>p.id===moving).name+' · '+room.name;drawMap();}else message('Tap inside a room to place this plant.',true);}else if(wasTap&&group){openGroup(group);}else if(wasTap&&id){drawMap();openPlant(id);}

 if(pointers.size){const p=[...pointers.values()][0];gesture={start:p,view:{...view},rotation,points:[...pointers.values()],moved:true,pan:true};}else gesture=null;

}

$('map').addEventListener('wheel',event=>{if(!view)return;event.preventDefault();if(pointers.size||busy)return;const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?$('map').clientHeight:1);if(delta)zoom(Math.exp(Math.max(-1,Math.min(1,delta*.001))),viewportPoint(event));},{passive:false});

$('map').addEventListener('pointerup',pointerEnd);$('map').addEventListener('pointercancel',()=>{cancelGesture();message('Move cancelled.');});

document.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;if(event.code==='Space'){space=true;event.preventDefault();}if(event.key==='Escape'){cancelGesture();if(moving)endPlacement();message('Move cancelled.');}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&lastMove){event.preventDefault();$('undo-map').click();}});

document.addEventListener('keyup',event=>{if(event.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;cancelGesture();});

new ResizeObserver(()=>{if(state){cancelGesture();drawMap();}}).observe($('map-stage'));

load();

})();

