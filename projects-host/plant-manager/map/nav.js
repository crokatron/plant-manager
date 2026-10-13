(() => {
 const tasks=document.querySelector('a[href$="/tasks"]');
 if(tasks&&!document.querySelector('a[href="/plant-map/"]')){const link=document.createElement('a');link.href='/plant-map/?v=20261009';link.className=tasks.className;link.textContent='Plant map & bottles';tasks.before(link);}
 const match=location.pathname.match(/^\/plants\/details\/(\d+)\/?$/);
 function addPlantLinks(){const heading=document.querySelector('h1');
 if(match&&heading&&!document.getElementById('mungoon-plant-links')){
  const links=document.createElement('div');links.id='mungoon-plant-links';links.style.cssText='display:flex;gap:10px;flex-wrap:wrap;margin:12px 0';
  for(const [text,url] of [['Inspect & log care in HA','/P/'+match[1]],['Print this plant’s tag','https://projects.mungoon.net/qr-studio/?plant='+match[1]]]){
   const link=document.createElement('a');link.textContent=text+' ↗';link.href=url;link.className='button is-small';link.target='_blank';link.rel='noopener';links.append(link);
  }
  heading.after(links);
 }
 return !!document.getElementById('mungoon-plant-links');
 }
 if(match&&!addPlantLinks()){
  const observer=new MutationObserver(()=>{if(addPlantLinks())observer.disconnect();});
  observer.observe(document.body,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),30000);
 }
})();
