/* Screen-distance groups preserve saved positions and split naturally on zoom. */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function layout(items,distance){
  let groups=[...items].sort((a,b)=>a.id-b.id).map(p=>({x:p.x,y:p.y,items:[p]}));
  // Restart after each merge: a new centroid can intersect another group's hit area.
  let changed=true;
  while(changed){changed=false;outer:for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   const a=groups[i],b=groups[j];if(Math.hypot(a.x-b.x,a.y-b.y)>=distance)continue;
   const items=[...a.items,...b.items].sort((a,b)=>a.id-b.id);
   groups[i]={items,x:items.reduce((v,p)=>v+p.x,0)/items.length,y:items.reduce((v,p)=>v+p.y,0)/items.length};groups.splice(j,1);changed=true;break outer;
  }}
  return groups.map(g=>({...g,key:g.items.map(p=>p.id).join('-')}));
 }
 function svg(g,r,s,prefix,status){
  const p=g.items[0].plant,worst=g.items.map(i=>status(i.plant)).sort((a,b)=>b.risk-a.risk)[0],clip=prefix+'-group-'+g.key;
  return `<g class="plant-group" data-plant-group="${g.key}" role="button" tabindex="0" aria-label="Choose from ${g.items.length} plants" transform="translate(${g.x},${g.y})"><title>${g.items.length} plants · Tap to choose by photo</title><circle r="${r+4*s}" fill="transparent"/><circle r="${r}" fill="#21392b" stroke="${worst.colour}" stroke-width="4" vector-effect="non-scaling-stroke"/>${p.photo?`<defs><clipPath id="${clip}"><circle r="${r-3*s}"/></clipPath></defs><image href="${esc(p.photo)}" x="${-r}" y="${-r}" width="${2*r}" height="${2*r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" pointer-events="none"/>`:''}<rect x="${-15*s}" y="${r-20*s}" width="${30*s}" height="${20*s}" rx="${9*s}" fill="#10231d" pointer-events="none"/><text x="0" y="${r-5*s}" text-anchor="middle" fill="#fff" font-size="${13*s}" font-weight="700" pointer-events="none">${g.items.length}</text></g>`;
 }
 function choices(items,status,room){return `<p>Choose a plant by its photo and name. Zoom in on the map to separate nearby plants.</p><div class="plant-group-grid">${items.map(({plant:p})=>{const w=status(p);return `<button class="plant-group-choice" data-choice="${p.id}">${p.photo?`<img src="${esc(p.photo)}" alt="" style="border-color:${w.colour}">`:`<span class="plant-group-placeholder" style="border-color:${w.colour}">♧</span>`}<span><strong>${esc(p.name)}</strong><small>${esc(room(p))}</small><small>${esc(w.reason)}</small></span></button>`;}).join('')}</div>`;}
 const css=`.plant-group{cursor:pointer}.plant-group:focus-visible{outline:3px solid white;outline-offset:4px}.plant-group-dialog{width:min(640px,calc(100vw - 32px));max-height:80dvh;box-sizing:border-box;overflow:auto;border:1px solid #6f9278;border-radius:16px;background:#14271d;color:#edf2e7;padding:18px}.plant-group-dialog::backdrop{background:#0009}.plant-group-dialog h2{margin:0 45px 12px 0}.plant-group-dialog>p{font-size:13px}.plant-group-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.plant-group-choice{display:flex;align-items:center;gap:12px;text-align:left;width:100%;min-height:94px;padding:10px;background:#223c2d;color:#edf2e7;border:1px solid #55735e;border-radius:12px;cursor:pointer}.plant-group-choice img,.plant-group-placeholder{width:60px;height:60px;object-fit:cover;border-radius:50%;border:4px solid;box-sizing:border-box;flex:none}.plant-group-choice strong{display:block;font-size:14px;overflow-wrap:anywhere}.plant-group-choice small{display:block;font-size:11px;margin-top:5px;color:#c9d7c9}.plant-group-close{float:right;min-width:44px;min-height:44px}@media(max-width:550px){.plant-group-grid{grid-template-columns:1fr}}`;
 const api={layout,svg,choices,css};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlantClusters=api;
})(typeof window==='object'?window:globalThis);
