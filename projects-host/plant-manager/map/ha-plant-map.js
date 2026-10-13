/* HA map uses the same camera as Plant Manager; care writes use the HA event bridge. */

(function(){

 const C=window.PlantCamera,E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

 const statuses={green:['#4dcc79','Checked · water available'],yellow:['#efc34e','Low water / check soon'],red:['#ed6664','Empty / unknown / quarantine']};

 const water=(a,p)=>window.PlantWaterStatus.plant(a,p);

 function status(a,p){return water(a,p).state;}

 function bounds(points){const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,p=Math.max(w,h)*.06;return {x:x-p,y:y-p,w:w+p*2,h:h+p*2};}

 function inside(p,polygon){let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[a,b]=polygon[i],[c,d]=polygon[j];if((b>p.y)!==(d>p.y)&&p.x<(c-a)*(p.y-b)/(d-b)+a)hit=!hit;}return hit;}

 function pair(points){const a=points[0],b=points[1];return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}:{...a,d:0,angle:0};}

 class PlantMap {

  constructor(host){this.host=host;this.rotation=0;this.room='';this.editing=false;this.pointers=new Map();this.selected=null;this.query='';}

  get a(){return this.host.data;}

  get root(){return this.host.shadowRoot;}

  $(s){return this.root.querySelector(s);}

  get active(){return this.pointers.size>0;}

  html(){if(this.host.config?.allow_edit!==true)this.editing=false;return `<div class="ha-workspace"><section class="ha-map-panel" aria-label="Plant floor plan"><div class="ha-map-heading"><h2>Plant floor plan</h2><label>View room<select id="ha-room"><option value="">Whole home</option>${this.a.floor.rooms.map(r=>`<option value="${E(r.id)}" ${this.room===r.id?'selected':''}>${E(r.name)}</option>`).join('')}</select></label></div><div class="ha-map-actions" ${this.host.config?.allow_edit===true?'':'hidden'}><button id="ha-edit" aria-pressed="${this.editing}">${this.editing?'Done editing':'Edit placements'}</button><button id="ha-undo" ${this.lastMove?'':'disabled'}>Undo move</button><button id="ha-help">Help</button></div><p hidden class="ha-map-message" role="status">${E(this.host.message||(this.editing?'Drag a photo; release inside a room to save.':'Tap a photo for plant details.'))}</p>${this.host.pending&&!this.host.busy?'<button id="ha-retry">Retry pending save</button>':''}<div class="ha-orientation" hidden><button id="ha-left" aria-label="Rotate map left">↶ 15°</button><label>Angle<input id="ha-angle" aria-label="Map rotation degrees" type="number" min="0" max="359" value="${Math.round(this.rotation)}"></label><button id="ha-right" aria-label="Rotate map right">15° ↷</button><button id="ha-reset">Drawing up</button><output id="ha-zoom" aria-label="Map zoom"></output></div><div class="ha-map-stage"><svg class="map" id="ha-map" role="group" tabindex="0" aria-label="Plant positions on your home floor plan"></svg><div class="ha-map-tools"><button id="ha-minus" aria-label="Zoom out">−</button><button id="ha-fit">Fit home</button><button id="ha-plus" aria-label="Zoom in">+</button></div></div><div class="ha-map-legend" aria-label="Map legend">${Object.entries(statuses).map(([key,[colour,label]])=>`<span><i style="background:${colour}"></i>${label}</span>`).join('')}</div></section><aside class="ha-collection" aria-label="Plant collection"><h2>Your plants (${this.a.plants.length})</h2><label>Find a plant<input id="ha-search" type="search" placeholder="Name, species or room…" value="${E(this.query)}"></label><div class="ha-plant-list"></div></aside></div>`;}

  bind(){

   this.dispose();this.abort=new AbortController();const signal=this.abort.signal,svg=this.$('#ha-map');if(!svg)return;

   if(!this.view){this.full=bounds(this.a.floor.rooms.flatMap(r=>r.points));this.view={...this.full};}

   const listen=(el,type,fn,opts={})=>el?.addEventListener(type,fn,{...opts,signal});

   const click=(s,fn)=>listen(this.$(s),'click',fn);

   click('#ha-edit',()=>{if(this.host.busy)return;this.editing=this.host.config?.allow_edit===true&&!this.editing;this.host.message='';if(this.editing&&!this.room){this.room=this.a.tracking[this.selected]?.position?.room||this.a.floor.rooms.find(r=>this.a.plants.some(p=>this.a.tracking[p.id]?.position?.room===r.id))?.id||'';}this.host.render();this.fit();});

   click('#ha-undo',()=>this.undo());click('#ha-help',()=>this.help());click('#ha-fit',()=>{this.room='';this.$('#ha-room').value='';this.fit();});

   click('#ha-plus',()=>this.zoom(.8));click('#ha-minus',()=>this.zoom(1.25));click('#ha-left',()=>this.rotate(this.rotation-15));click('#ha-right',()=>this.rotate(this.rotation+15));click('#ha-reset',()=>this.rotate(0));

   if(this.$('#ha-retry'))click('#ha-retry',()=>this.retry());

   listen(this.$('#ha-angle'),'input',e=>{if(e.target.value!==''&&Number.isFinite(Number(e.target.value)))this.rotate(Number(e.target.value));});

   listen(this.$('#ha-room'),'change',e=>{this.room=e.target.value;this.fit();});listen(this.$('#ha-search'),'input',e=>{this.query=e.target.value;this.list();});

   listen(svg,'pointerdown',e=>this.down(e));listen(svg,'pointermove',e=>this.move(e));listen(svg,'pointerup',e=>this.end(e));listen(svg,'pointercancel',()=>{this.cancel();this.message('Move cancelled.');});

   listen(svg,'wheel',e=>{e.preventDefault();if(this.active||this.host.busy)return;const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);this.zoom(Math.exp(Math.max(-1,Math.min(1,d*.001))),this.point(e,false));},{passive:false});

   listen(svg,'keydown',e=>{const group=e.target.closest('[data-plant-group]');if(group&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();this.groupInfo(group.dataset.plantGroup);return;}const marker=e.target.closest('[data-map-plant]');if(marker&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();this.info(Number(marker.dataset.mapPlant));}});

   listen(this.root,'keydown',e=>{if(e.target.matches('input,textarea,select')||this.$('dialog[open]'))return;if(e.code==='Space'){this.space=true;e.preventDefault();}if(e.key==='Escape'){this.cancel();this.message('Move cancelled.');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&this.lastMove&&this.host.config?.allow_edit===true){e.preventDefault();this.undo();}});

   listen(window,'keyup',e=>{if(e.code==='Space')this.space=false;});listen(window,'blur',()=>{this.space=false;this.cancel();});

   this.resize=new ResizeObserver(()=>{if(this.active)this.cancel();this.draw();});this.resize.observe(this.$('.ha-map-stage'));this.list();this.draw();

  }

  dispose(){this.abort?.abort();this.resize?.disconnect();clearTimeout(this.hold);}

  message(text){this.host.message=text;const el=this.$('.ha-map-message');if(el)el.textContent=text;}

  fit(){if(!this.view||this.active)return;const rooms=this.room?this.a.floor.rooms.filter(r=>r.id===this.room):this.a.floor.rooms;this.view=bounds(rooms.flatMap(r=>r.points).map(p=>{const q=C.rotate({x:p[0],y:p[1]},this.rotation);return[q.x,q.y];}));this.draw();}

  rotate(a){if(this.active||this.host.busy)return;this.rotation=C.wrap(a);this.fit();}

  zoom(f,anchor){if(!this.view||this.host.busy)return;this.view=C.zoom(this.view,f,anchor);this.draw();}

  point(e,world=true){const svg=this.$('#ha-map'),r=svg.getBoundingClientRect();return C.unproject({x:e.clientX-r.left,y:e.clientY-r.top},this.view,r.width,r.height,world?this.rotation:0);}

  draw(){

   const svg=this.$('#ha-map');if(!svg||!this.view)return;const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)return;const s=1/C.frame(this.view,rect.width,rect.height).scale,r=C.portraitRadius(this.full.w/this.view.w)*s;

   svg.setAttribute('viewBox',`${this.view.x} ${this.view.y} ${this.view.w} ${this.view.h}`);svg.classList.toggle('editing',this.editing);

   const marker=(p,pos,pending=false)=>{const q=C.rotate(pos,this.rotation),label=p.name.split(' · ')[0],short=label.length>27?label.slice(0,26)+'…':label,w=Math.min(200,Math.max(75,short.length*6.5))*s,colour=water(this.a,p).colour;return `<g class="ha-marker ${p.photo?'has-photo':''} ${this.selected===p.id?'selected':''} ${pending?'pending':''}" role="button" tabindex="0" data-map-plant="${p.id}" aria-label="${E(p.name)}" transform="translate(${q.x},${q.y})"><title>${E(p.name)} · ${E(water(this.a,p).reason)}</title><circle class="ha-ring" r="${r}" fill="${colour}" stroke="${colour}"/><circle class="ha-hit" r="${r+4*s}"/>${p.photo?`<defs><clipPath id="ha-portrait-${p.id}"><circle r="${r-4*s}"/></clipPath></defs><image href="${E(p.photo)}" x="${-r}" y="${-r}" width="${2*r}" height="${2*r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ha-portrait-${p.id})" pointer-events="none"/>`:`<text font-size="${22*s}" y="${7*s}">♧</text>`}<g class="ha-marker-name"><rect x="${-w/2}" y="${r+6*s}" width="${w}" height="${24*s}" rx="${5*s}"/><text x="0" y="${r+22*s}" font-size="${11*s}">${E(short)}</text></g></g>`;};

   let html=`<g transform="rotate(${this.rotation})">${this.a.floor.rooms.map(room=>`<polygon class="${room.id===this.room?'chosen':''}" points="${room.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}${(this.a.floor.walls||[]).map(w=>`<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}"/>`).join('')}</g>`;

   html+=this.a.floor.rooms.map(room=>{const b=bounds(room.points),q=C.rotate({x:room.label?.[0]??b.x+b.w/2,y:room.label?.[1]??b.y+b.h/2},this.rotation);return `<text class="ha-room-name" x="${q.x}" y="${q.y}" font-size="${11*s}">${E(room.name)}</text>`;}).join('');

   const pending=this.drag||this.saving;const items=this.a.plants.flatMap(p=>{const pos=this.a.tracking[p.id]?.position;return pos&&p.id!==pending?.id?[{id:p.id,plant:p,...C.rotate(pos,this.rotation)}]:[];});this.groups=this.editing?[]:window.PlantClusters.layout(items,2*r+14*s);const grouped=new Set(this.groups.filter(g=>g.items.length>1).flatMap(g=>g.items.map(p=>p.id)));html+=this.groups.filter(g=>g.items.length>1).map(g=>window.PlantClusters.svg(g,r,s,'ha',p=>water(this.a,p))).join('');for(const p of [...this.a.plants].sort((a,b)=>(a.id===this.selected)-(b.id===this.selected))){const pos=this.a.tracking[p.id]?.position;if(pos&&p.id!==pending?.id&&!grouped.has(p.id))html+=marker(p,pos);}

   if(pending)html+=marker(this.a.plants.find(p=>p.id===pending.id),pending.position,true);svg.innerHTML=html;

   if(this.root.activeElement!==this.$('#ha-angle'))this.$('#ha-angle').value=Math.round(this.rotation);this.$('#ha-zoom').textContent=Math.round(this.full.w/this.view.w*100)+'%';

  }

  list(){const query=this.query.toLowerCase();this.$('.ha-plant-list').innerHTML=this.a.plants.filter(p=>{const room=this.a.floor.rooms.find(r=>r.id===this.a.tracking[p.id]?.position?.room)?.name||'Placement pending';return `${p.name} ${p.scientific_name} ${room}`.toLowerCase().includes(query);}).map(p=>{const t=this.a.tracking[p.id],room=this.a.floor.rooms.find(r=>r.id===t?.position?.room)?.name||'Placement pending';return `<a class="ha-plant-row" style="--water-ring:${water(this.a,p).colour}" href="/plant-map/plant-${p.id}">${p.photo?`<img src="${E(p.photo)}" alt="" loading="lazy">`:'<span>♧</span>'}<div><strong>${E(p.name)}</strong><small>${E(room)} · ${t?.bottles.length||0} bottles</small><small>${E(water(this.a,p).reason)}</small></div></a>`;}).join('')||'<p>No matching plants.</p>';}

  cancel(){clearTimeout(this.hold);this.pointers.clear();this.gesture=null;this.drag=null;this.draw();}

  down(e){

   if(this.host.busy||e.button>1)return;e.preventDefault();this.$('#ha-map').focus({preventScroll:true});clearTimeout(this.hold);const marker=e.target.closest('[data-map-plant]'),pan=this.space||e.button===1;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.$('#ha-map').setPointerCapture(e.pointerId);

   if(this.pointers.size>1){this.drag=null;this.message('Two fingers move the map.');this.draw();}

   else if(marker&&this.editing&&!pan){const id=Number(marker.dataset.mapPlant),pos=this.a.tracking[id].position,p=this.point(e);this.selected=id;this.drag={id,position:{...pos},offset:{x:pos.x-p.x,y:pos.y-p.y},moved:false};}

   this.gesture={start:{x:e.clientX,y:e.clientY},points:[...this.pointers.values()],view:{...this.view},rotation:this.rotation,moved:this.pointers.size>1,pan,group:!pan?e.target.closest('[data-plant-group]')?.dataset.plantGroup:null,id:marker&&!pan?Number(marker.dataset.mapPlant):null};

   if(e.pointerType==='touch'&&this.gesture.id&&this.pointers.size===1){const id=this.gesture.id;this.hold=setTimeout(()=>{if(this.gesture&&!this.gesture.moved&&!this.drag?.moved){this.cancel();this.info(id);}},650);}

  }

  move(e){

   if(!this.pointers.has(e.pointerId)||!this.gesture)return;e.preventDefault();this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=this.gesture;

   if(this.drag){if(Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>6)this.drag.moved=true;if(this.drag.moved){clearTimeout(this.hold);const p=this.point(e);this.drag.position={x:p.x+this.drag.offset.x,y:p.y+this.drag.offset.y};const room=this.a.floor.rooms.find(r=>inside(this.drag.position,r.points));this.drag.position.room=room?.id;this.message(room?'Release to place in '+room.name:'Keep the photo inside a room.');this.draw();}return;}

   const start=pair(g.points),end=pair([...this.pointers.values()]),twist=Math.abs(C.wrap(end.angle-start.angle+180)-180);if(!g.moved&&Math.hypot(end.x-start.x,end.y-start.y)<5&&Math.abs(end.d-start.d)<5&&twist<2)return;

   clearTimeout(this.hold);g.moved=true;const r=this.$('#ha-map').getBoundingClientRect(),local=p=>({...p,x:p.x-r.left,y:p.y-r.top}),next=C.gesture(g.view,g.rotation,r.width,r.height,local(start),local(end));this.view=next.view;this.rotation=next.rotation;this.draw();

  }

  async end(e){

   clearTimeout(this.hold);if(!this.pointers.has(e.pointerId))return;const g=this.gesture,drop=this.drag,tap=g&&!g.moved&&!g.pan&&this.pointers.size===1;this.pointers.delete(e.pointerId);this.drag=null;const svg=this.$('#ha-map');if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);

   if(drop?.moved){this.gesture=null;if(!drop.position.room){this.draw();this.message('Move cancelled: drop inside a room.');return;}await this.save(drop);return;}

   if(tap&&g.group){this.groupInfo(g.group);}else if(tap&&g.id){this.choose(g.id,e);}

   if(this.pointers.size){const p=[...this.pointers.values()][0];this.gesture={start:p,points:[...this.pointers.values()],view:{...this.view},rotation:this.rotation,moved:true,pan:true};}else this.gesture=null;

  }

  async save(drop){this.saving=drop;this.draw();try{if(await this.host.act({action:'move',plant_id:drop.id,...drop.position})){this.lastMove={id:drop.id,event:this.a.tracking[drop.id].last_event};this.message('Placement saved.');}}finally{this.saving=null;this.host.render();}}

  async undo(){if(this.host.busy||!this.lastMove)return;const move=this.lastMove;if(await this.host.act({action:'undo',plant_id:move.id,event_id:move.event})){this.lastMove=null;this.message('Move undone.');this.host.render();}}

  async retry(){const command=this.host.pending?.command;if(!command)return;if(command.action==='move')this.saving={id:command.plant_id,position:{room:command.room,x:command.x,y:command.y}};try{if(await this.host.act(null,true)&&command.action==='move')this.lastMove={id:command.plant_id,event:this.a.tracking[command.plant_id].last_event};}finally{this.saving=null;this.host.render();}}

  dialog(title,body){const d=document.createElement('dialog');d.className='plant-choice';d.innerHTML=`<form method="dialog"><button class="ha-close" aria-label="Close dialog">×</button></form><h2>${E(title)}</h2>${body}`;d.addEventListener('close',()=>d.remove());this.root.append(d);d.showModal();return d;}

  groupInfo(key){const g=this.groups?.find(g=>g.key===key);if(!g)return;const room=p=>this.a.floor.rooms.find(r=>r.id===this.a.tracking[p.id]?.position?.room)?.name||'';const d=this.dialog(`${g.items.length} nearby plants`,window.PlantClusters.choices(g.items,p=>water(this.a,p),room));d.classList.add('plant-group-dialog');d.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{d.close();this.info(Number(b.dataset.choice));});}

  choose(id,e){

   const hits=[...this.$('#ha-map').querySelectorAll('[data-map-plant]')].filter(m=>{const r=m.querySelector('circle').getBoundingClientRect();return Math.hypot(e.clientX-r.x-r.width/2,e.clientY-r.y-r.height/2)<=Math.max(22,r.width/2);});

   if(hits.length<2){this.info(id);return;}

   const d=this.dialog('Which plant?',hits.map(m=>{const p=this.a.plants.find(p=>p.id===Number(m.dataset.mapPlant));return `<button class="ha-choice" data-choice="${p.id}">${E(p.name)}</button>`;}).join(''));

   d.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{d.close();this.info(Number(b.dataset.choice));});

  }

  info(id){if(this.host.busy)return;this.selected=id;this.draw();const p=this.a.plants.find(p=>p.id===id),t=this.a.tracking[id],room=this.a.floor.rooms.find(r=>r.id===t?.position?.room)?.name||'Placement pending';this.dialog(p.name,`${p.photo?`<img class="ha-info-photo" src="${E(p.photo)}" alt="${E(p.name)}">`:''}<p>${E(p.scientific_name)}<br>${E(room)} · ${t?.bottles.length||0} bottles</p><p>${E(water(this.a,p).reason)}</p><a href="/plant-map/plant-${id}">Open care & bottle logging →</a>`);}

  help(){this.dialog('Map gestures',`<p><b>Mouse:</b> scroll to zoom toward your pointer. Drag empty space to pan. Space + drag or the middle button pans over a plant.</p><p><b>Touch:</b> pinch to zoom, use two fingers to pan or twist to rotate. Tap or hold a photo for information.</p><p><b>Edit placements:</b> drag a photo and release inside a room to save. A second finger cancels the tentative move. Escape cancels; Ctrl / ⌘ + Z undoes the last move.</p><p>Choose a room to focus. Fit home shows everything; Drawing up resets rotation. Photo borders match the map legend.</p>`);}

 }

 window.MungoonPlantMap=PlantMap;

 window.MungoonPlantMapStatus=status;

 window.MungoonPlantMapCSS=`[hidden]{display:none!important}.ha-home{height:calc(100dvh - 100px);min-height:500px;display:flex;flex-direction:column;box-sizing:border-box}.ha-home #care{flex:1;min-height:0}.ha-home .ha-title{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}.ha-title h1{font-size:22px;margin:0}.ha-title p{margin:0;font-size:12px}.ha-workspace{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;height:100%;min-height:0}.ha-map-panel{display:flex;flex-direction:column;min-height:0;border:1px solid #425f49;border-radius:14px;overflow:hidden}.ha-map-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 14px}.ha-map-heading h2{font-size:17px;margin:0}.ha-map-heading label{margin:0;font-size:11px;width:155px}.ha-map-heading select{width:100%;padding:7px;min-height:40px}.ha-map-actions,.ha-orientation{display:flex;gap:6px;padding:4px 12px;align-items:center;flex-wrap:wrap}.ha-map-actions button,.ha-orientation button{font-size:12px;padding:7px 10px;min-height:40px}.ha-map-actions [aria-pressed=true]{background:#b5d990;color:#16251c}.ha-map-message{font-size:11px;margin:3px 12px;height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none}.ha-orientation label{display:flex;align-items:center;gap:5px;font-size:11px;margin:0}.ha-orientation input{width:62px;padding:7px;margin:0;min-height:40px}.ha-orientation output{margin-left:auto;font-size:11px}.ha-map-stage{position:relative;flex:1;min-height:170px;overflow:hidden;background:#14271d}.ha-map-stage .map{display:block;width:100%;height:100%;max-height:none;border-radius:0;touch-action:none;user-select:none;cursor:grab}.map .ha-marker{cursor:pointer}.map.editing .ha-marker{cursor:grab}.map .ha-hit{fill:transparent;stroke:none}.map .ha-ring{stroke-width:3;vector-effect:non-scaling-stroke}.map .ha-marker.selected .ha-ring{stroke-width:5}.map .ha-marker.pending .ha-ring{stroke:#fff;stroke-dasharray:4 3}.map .ha-marker-name{display:none}.map.editing .ha-marker-name,.map .ha-marker.selected .ha-marker-name,.map .ha-marker:hover .ha-marker-name,.map .ha-marker:focus-visible .ha-marker-name{display:block}.map .ha-marker-name rect{fill:#10231df5;stroke:#7e9882;stroke-width:1;vector-effect:non-scaling-stroke}.map .ha-marker text,.map .ha-room-name{text-anchor:middle;pointer-events:none}.map .ha-marker-name text{fill:#edf2e7}.map .ha-room-name{fill:#c1d1bd}.map polygon,.map line{vector-effect:non-scaling-stroke;stroke:#69806a;stroke-width:2}.map polygon.chosen{fill:#37553a;stroke:#bddc98}.map line{stroke-width:4}.ha-map-tools{position:absolute;bottom:12px;left:12px;display:flex;gap:5px}.ha-map-tools button{background:#193023ee;padding:7px 12px;min-height:44px}.ha-map-legend{display:flex;flex-wrap:wrap;gap:7px 14px;padding:8px 12px;font-size:11px;background:#1c3024}.ha-map-legend span{display:flex;align-items:center;gap:6px}.ha-map-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}.ha-collection{display:flex;flex-direction:column;min-height:0;border:1px solid #425f49;border-radius:14px;padding:12px}.ha-collection h2{font-size:18px;margin:0}.ha-collection label{font-size:12px;margin:10px 0}.ha-collection input{width:100%}.ha-plant-list{overflow:auto;min-height:0;flex:1}.ha-plant-row{display:flex;align-items:center;gap:10px;padding:9px 0;text-decoration:none;border-bottom:1px solid #314837}.ha-plant-row img,.ha-plant-row>span{width:52px;height:62px;object-fit:cover;border-radius:8px;flex:none}.ha-plant-row strong{font-size:13px}.ha-plant-row small{display:block;font-size:11px;margin-top:5px}.ha-home .section{flex:1;min-height:0;overflow:auto;margin:10px 0}.ha-home .tabs{position:static;flex:none;order:3;border-top:1px solid #425f49;justify-content:center;padding:8px 0 0;flex-wrap:nowrap}.ha-home .tabs button{min-height:44px;font-size:12px}.tabs button[aria-pressed=true]{background:#557342}.ha-home[data-section=plants] .ha-workspace{display:block}.ha-home[data-section=plants] .ha-map-panel{display:none}.ha-home[data-section=plants] .ha-collection{height:100%;box-sizing:border-box;max-width:1000px;margin:auto}.ha-info-photo{display:block;width:100%;height:200px;object-fit:contain}.ha-choice{display:block;width:100%;text-align:left;margin:8px 0}.ha-close{float:right;padding:5px 12px}.ha-home .ha-title{flex:none;margin:0 0 10px}@media(min-width:701px) and (max-width:1150px){.ha-workspace{grid-template-columns:minmax(0,1fr) 240px}}@media(max-width:700px){.ha-home{padding:8px;height:calc(100dvh - 88px);min-height:520px}.ha-workspace{display:block}.ha-map-panel{height:100%;box-sizing:border-box}.ha-home[data-section=care] .ha-collection{display:none}.ha-home .ha-title{gap:3px;margin-bottom:5px}.ha-title h1{font-size:18px}.ha-title p{font-size:10px}.ha-map-heading{padding:7px 9px}.ha-map-heading h2{font-size:14px}.ha-map-heading label{width:133px}.ha-map-actions,.ha-orientation{padding:3px 8px;gap:4px}.ha-map-actions button,.ha-orientation button{font-size:11px;padding:6px 8px}.ha-orientation label{font-size:0;gap:0}.ha-orientation input{width:48px;font-size:12px}.ha-map-legend{font-size:10px;gap:6px 10px;padding:7px 9px}.map.editing .ha-marker.has-photo:not(.selected):not(:focus-visible) .ha-marker-name{display:none}.ha-home .tabs{gap:3px}.ha-home .tabs button{flex:1;min-width:0;min-height:48px;font-size:10px;padding:6px 3px}.ha-home .section{padding:12px}.ha-home .ha-collection{height:100%}.ha-collection input{font-size:16px}}`;

window.MungoonPlantMapCSS+=`

.ha-home{height:calc(100dvh - 64px);min-height:300px;padding:6px!important;border-radius:0!important;max-width:none}

.ha-home .ha-title{display:none}.ha-home .ha-workspace{display:block}.ha-home[data-section=care] .ha-collection{display:none}

.ha-map-panel{height:100%;box-sizing:border-box}.ha-map-heading{padding:0 6px;height:44px;flex:none}.ha-map-heading h2{font-size:15px}.ha-map-heading label{display:flex;align-items:center;gap:6px;width:205px}.ha-map-heading select{margin:0;min-height:36px;padding:4px}

.ha-home .tabs{padding:4px 0 0;gap:5px}.ha-home .tabs button{min-height:40px;padding:7px 10px}

.ha-map-legend{padding:5px 9px;font-size:11px}.ha-map-stage{min-height:100px}.ha-plant-row img,.ha-plant-row>span{box-sizing:border-box;border:4px solid var(--water-ring);border-radius:50%;width:58px;height:58px}

.ha-home[data-section=plants] .ha-collection h2{padding-left:88px;min-height:36px}.ha-home .ha-map-heading h2{display:none}.ha-home .ha-map-heading{justify-content:flex-end}.hub-home{position:absolute;top:9px;left:12px;z-index:2;min-height:38px!important;padding:7px 12px!important;font-size:14px}.ha-home{position:relative}

@media(max-width:700px){.ha-home{height:calc(100dvh - 64px);min-height:300px}.ha-home .tabs button{min-height:42px;padding:5px 3px;font-size:10px}.ha-map-heading label{width:175px}.ha-map-legend{font-size:10px}}

`;

window.MungoonPlantMapCSS+=window.PlantClusters?.css||'';
})();

