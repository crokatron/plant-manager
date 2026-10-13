const assert=require('node:assert/strict'),C=require('./plant-clusters.js');
const source=[{id:3,x:0,y:0},{id:1,x:10,y:0},{id:2,x:80,y:0},{id:4,x:300,y:0}];
const snapshot=JSON.stringify(source),groups=C.layout(source,60);
assert.equal(JSON.stringify(source),snapshot,'never changes saved coordinates');
assert.deepEqual(groups.flatMap(g=>g.items.map(p=>p.id)).sort(),[1,2,3,4]);
assert.deepEqual(C.layout([...source].reverse(),60),groups,'deterministic across refresh ordering');
for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++)assert(Math.hypot(groups[i].x-groups[j].x,groups[i].y-groups[j].y)>=60);
assert.equal(C.layout(source.map(p=>({...p,x:p.x*10})),60).length,4,'zoom separates plants');
assert.equal(C.layout(Array.from({length:33},(_,id)=>({id,x:0,y:0})),60)[0].items.length,33,'coincident plants remain selectable');
for(let seed=1;seed<25;seed++){
 const rows=Array.from({length:33},(_,id)=>({id,x:(id*37*seed)%400,y:(id*97*seed)%400}));const g=C.layout(rows,56);
 assert.equal(g.flatMap(x=>x.items).length,33);
 for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++)assert(Math.hypot(g[i].x-g[j].x,g[i].y-g[j].y)>=56);
}
console.log('Plant grouping: no overlap, full membership, no saved-position changes, stable order and zoom splitting passed.');
