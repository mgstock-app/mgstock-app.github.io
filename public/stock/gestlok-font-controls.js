/* GESTLOK · tamaño de letras 50–180 % por empresa/local/vista y tarjeta.
   Preferencia local al dispositivo/usuario; nunca afecta los datos del negocio. */
(()=>{
'use strict';
if(window.GestLokTextScale)return;
const MIN=50,MAX=180,STEP=10,PREFIX='gestlok:font-scale:v1:';
const NODE_SELECTOR='h1,h2,h3,h4,h5,h6,p,span,strong,b,small,label,button,input,select,textarea,th,td,li,summary,a,caption,dt,dd';
const CARD_SELECTOR='.gcm-hd-summary-group,.gcm-section,.gcm-hd-category,.mhs-card,.ch,.gl-empresa-card,.gl-local-card,.gl-oh-card,.gl-owner-card,.card,.module-card,.local-card,.empresa-card,[class*="module-card"],[class*="business-card"],[class*="local-card"],[class*="company-card"]';
const originals=new WeakMap();
let timer=null,busy=false,initialized=false,hadCustomTextSize=false;
const clamp=n=>Math.max(MIN,Math.min(MAX,Math.round((Number(n)||100)/STEP)*STEP));
const hash=s=>{
 let h=2166136261;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
 return (h>>>0).toString(36);
};
const root=()=>document.getElementById('stock-root')||document.querySelector('.app-shell');
const context=()=>{
 const nav=typeof window.GestLokNavContext==='function'?window.GestLokNavContext():null;
 const heading=document.querySelector('#crumb b')?.textContent||document.getElementById('ttl')?.textContent||
  document.querySelector('.app-shell main h1,.app-shell main h2')?.textContent||'inicio';
 return PREFIX+hash([location.pathname,nav?.uid||'dispositivo',nav?.tenant||'global',
  nav?.local||'empresa',heading.trim().slice(0,90)].join('|'))+':';
};
const read=key=>{
 try{const n=Number(localStorage.getItem(key));return n>=MIN&&n<=MAX?clamp(n):100;}
 catch(_){return 100;}
};
const readCard=(key,fallback)=>{try{const val=localStorage.getItem(key);return val===null?fallback:read(key);}catch(_){return fallback;}};
const save=(key,n)=>{try{localStorage.setItem(key,String(n));}catch(_){}};
const escapeAttr=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const css=[
 '#glk-font-widget{position:fixed;right:12px;bottom:106px;z-index:7990;display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:11px;background:#fff;border:1px solid #cbd7e3;box-shadow:0 4px 18px #12283c24;color:#153555;font:700 12px system-ui,sans-serif!important}',
 '#glk-font-widget[hidden]{display:none!important}',
 '#glk-font-widget button,.glk-font-card-buttons button{border:1px solid #c7d6e4;padding:4px 8px;border-radius:7px;background:#f8fbfd;color:#183d5c;font:800 12px system-ui,sans-serif!important;cursor:pointer;min-height:29px;min-width:30px}',
 '#glk-font-widget button:disabled,.glk-font-card-buttons button:disabled{opacity:.38;cursor:default}',
 '#glk-font-widget output{min-width:37px;text-align:center;font:700 12px system-ui,sans-serif!important}',
 '#glk-font-widget .glk-font-label{font:750 11px system-ui,sans-serif!important}',
 '#glk-font-widget .glk-font-reset{min-width:0;padding-inline:6px;font:700 11px system-ui,sans-serif!important}',
 '.glk-font-card-buttons{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-height:32px;padding:4px 7px 0;box-sizing:border-box;font:700 11px system-ui,sans-serif!important}',
 '.glk-font-card-buttons output{min-width:36px;text-align:center;color:#536a7d;font:700 11px system-ui,sans-serif!important}',
 '.glk-font-card-buttons button{padding:2px 6px;min-width:26px;min-height:26px}',
 '@media(max-width:760px){#glk-font-widget{right:8px;bottom:99px;padding:5px 7px;gap:4px}#glk-font-widget .glk-font-label{display:none}.glk-font-card-buttons button{min-height:30px}}',
 '@media print{#glk-font-widget,.glk-font-card-buttons{display:none!important}}'
].join('');
function install(){
 if(initialized)return;initialized=true;
 const style=document.createElement('style');style.id='glk-font-style';style.textContent=css;document.head.appendChild(style);
 const bar=document.createElement('div');bar.id='glk-font-widget';
 bar.setAttribute('role','group');bar.setAttribute('aria-label','Tamaño de letra de esta pantalla');
 bar.innerHTML='<span class="glk-font-label">Texto</span>'+
 '<button type="button" data-font-global="-1" aria-label="Reducir tamaño de letra">A−</button>'+
 '<output aria-live="polite">100%</output>'+
 '<button type="button" data-font-global="1" aria-label="Aumentar tamaño de letra">A+</button>'+
 '<button type="button" class="glk-font-reset" data-font-reset aria-label="Restablecer letra al 100%">100%</button>';
 document.body.appendChild(bar);
 document.addEventListener('click',e=>{
  const button=e.target?.closest?.('[data-font-global],[data-font-reset],[data-font-card]');
  if(!button)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();
  const key=context();
  if(button.hasAttribute('data-font-card')){
   const card=button.closest('[data-glk-font-card-key]');if(!card)return;
   const k=key+'card:'+card.dataset.glkFontCardKey;
   save(k,clamp(readCard(k,read(key+'global'))+Number(button.dataset.fontCard)*STEP));
  }else{
   const k=key+'global';
   save(k,button.hasAttribute('data-font-reset')?100:clamp(read(k)+Number(button.dataset.fontGlobal)*STEP));
  }
  schedule();
 },true);
 window.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('popstate',schedule,{passive:true});
 new MutationObserver(records=>{
  if(busy)return;
  if(records.some(rec=>[...rec.addedNodes].some(n=>
   n.nodeType===1&&!n.closest?.('.glk-font-card-buttons,#glk-font-widget'))))schedule();
 }).observe(document.body,{subtree:true,childList:true});
}
function setupCards(target,key,global){
 const counters=new Map();
 const cards=[...target.querySelectorAll(CARD_SELECTOR)].filter(card=>card instanceof HTMLElement);
 for(const card of cards){
  const title=card.querySelector('h2,h3,h4,[class*="title"],strong');
  if(!title)continue;
  const label=(title.textContent||card.getAttribute('aria-label')||card.className||'tarjeta')
   .replace(/\s+/g,' ').trim().slice(0,70);
  const ordinal=(counters.get(label)||0)+1;counters.set(label,ordinal);
  const stable=hash(label+'|'+ordinal);
  card.dataset.glkFontCardKey=stable;
  if(!card.querySelector(':scope > .glk-font-card-buttons')){
   const bar=document.createElement('div');bar.className='glk-font-card-buttons';
   bar.setAttribute('role','group');bar.setAttribute('aria-label','Letra de '+label);
   bar.innerHTML='<button type="button" data-font-card="-1" aria-label="Reducir letra de '+escapeAttr(label)+'">A−</button>'+
    '<output>100%</output>'+
    '<button type="button" data-font-card="1" aria-label="Aumentar letra de '+escapeAttr(label)+'">A+</button>';
   card.prepend(bar);
  }
  const scale=readCard(key+'card:'+stable,global);
  card.dataset.glkFontCardValue=String(scale);
  const bar=card.querySelector(':scope > .glk-font-card-buttons');
  if(!bar)continue;
  const out=bar.querySelector('output');if(out)out.textContent=scale+'%';
  const buttons=bar.querySelectorAll('button');
  if(buttons[0])buttons[0].disabled=scale<=MIN;
  if(buttons[1])buttons[1].disabled=scale>=MAX;
 }
}
function apply(){
 const target=root(),widget=document.getElementById('glk-font-widget');
 if(!target||!widget)return;
 const key=context(),global=read(key+'global');
 const status=widget.querySelector('output');if(status)status.textContent=global+'%';
 widget.querySelector('[data-font-global="-1"]').disabled=global<=MIN;
 widget.querySelector('[data-font-global="1"]').disabled=global>=MAX;
 const nav=typeof window.GestLokNavContext==='function'?window.GestLokNavContext():null;
 widget.hidden=target.id==='stock-root'&&!nav?.uid;
 setupCards(target,key,global);
 const hasCustom=global!==100||[...target.querySelectorAll('[data-glk-font-card-value]')]
  .some(el=>Number(el.dataset.glkFontCardValue)!==100);
 if(!hasCustom&&!hadCustomTextSize)return;
 hadCustomTextSize=hasCustom;
 const nodes=[...target.querySelectorAll(NODE_SELECTOR)].filter(el=>
  el instanceof HTMLElement && !el.closest('.glk-font-card-buttons,#glk-font-widget'));
 // Recuperar la tipografía base ANTES de medir: evita multiplicar tamaños en cascada.
 for(const el of nodes){
  if(!originals.has(el))originals.set(el,el.style.fontSize||'');
  else el.style.fontSize=originals.get(el);
 }
 if(!hasCustom)return;
 const measured=nodes.map(el=>parseFloat(getComputedStyle(el).fontSize));
 nodes.forEach((el,i)=>{
  const card=el.closest('[data-glk-font-card-key]');
  const size=card?Number(card.dataset.glkFontCardValue)||global:global;
  if(size!==100&&Number.isFinite(measured[i])&&measured[i]>0)
   el.style.fontSize=(Math.round(measured[i]*size)/100)+'px';
 });
}
function schedule(){
 if(timer!==null)clearTimeout(timer);
 timer=setTimeout(()=>{
  timer=null;if(busy)return;
  busy=true;
  try{apply();}catch(err){console.warn('GESTLOK: no se pudo aplicar tamaño de letra',err);}
  finally{busy=false;}
 },120);
}
function start(){
 if(!document.body){document.addEventListener('DOMContentLoaded',start,{once:true});return;}
 install();schedule();
}
window.GestLokTextScale=Object.freeze({start,setScreenPercent:n=>{
 save(context()+'global',clamp(n));schedule();
},range:[MIN,MAX]});
start();
})();