/* QR login: same-origin pairing, ephemeral proofs, separate desktop session. */
(()=>{
'use strict';
if(window.GestLokQrLogin)return;
const cfg=window.SPM_CONFIG||{};
const valid=/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.([a-f0-9]{64})$/;
let pair=location.hash.startsWith('#glqr=')?location.hash.slice(6):'';
if(pair)history.replaceState(null,'',location.pathname+location.search);
const sb=()=>window.GestLokSupabase;
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const button=(label,fn)=>{const b=el('button',label);b.type='button';b.style.cssText='padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#173450;font:inherit;cursor:pointer';b.addEventListener('click',fn);return b;};
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
let dialog=null,generation=0,active=null;
function close(){
 generation++;const old=active;active=null;
 if(old)void api('cancel',old.id,old.desktop).catch(()=>{});
 if(dialog){dialog.close();dialog.remove();dialog=null;}
}
function open(title){
 close();const d=el('dialog');d.style.cssText='width:min(92vw,420px);max-height:86vh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:18px;color:#142c46;background:white;box-shadow:0 20px 70px #0004;z-index:99999';
 const h=el('h2',title);h.style.margin='0 0 14px';
 const body=el('div');body.style.cssText='display:grid;gap:12px';
 const state=el('p');state.setAttribute('role','status');state.style.cssText='margin:0;color:#41566e;overflow-wrap:anywhere';
 d.append(h,body,state,button('Cerrar',close));d.addEventListener('cancel',e=>{e.preventDefault();close();});
 document.body.append(d);dialog=d;d.showModal();return {body,state,g:generation};
}
async function api(action,id,proof,extra={},token){
 if(!cfg.url||!cfg.key)throw Error('Conexión no disponible.');
 const r=await fetch(cfg.url.replace(/\/$/,'')+'/functions/v1/gestlok-qr-login',{method:'POST',cache:'no-store',headers:{'content-type':'application/json',apikey:cfg.key,authorization:'Bearer '+(token||cfg.key)},body:JSON.stringify({action,id,proof,...extra}),signal:AbortSignal.timeout(12000)});
 const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'No se pudo conectar.');return j;
}
async function desktop(){
 const {body,state,g}=open('Ingresar con QR');state.textContent='Generando código…';
 try{
  if((await sb().auth.getSession()).data.session)throw Error('Ya tenés una sesión abierta en este equipo.');
  const c=await api('create');if(g!==generation){void api('cancel',c.id,c.desktop).catch(()=>{});return;}
  active=c;
  const link=location.origin+'/login/#glqr='+c.id+'.'+c.scan;
  const q=window.qrcode(0,'M');q.addData(link);q.make();
  const img=el('img');img.src=q.createDataURL(6,4);img.alt='QR temporal para iniciar sesión';img.style.cssText='width:min(260px,100%);margin:auto;image-rendering:pixelated';
  const check=el('strong',c.code);check.style.cssText='font-size:30px;letter-spacing:5px;text-align:center';
  body.append(el('p','Escaneá el QR con tu teléfono, donde ya tenés GESTLOK abierto. Compará este código y autorizá el acceso.'),img,check,
   button('Copiar enlace para abrir en el teléfono',async()=>{try{await navigator.clipboard.writeText(link);state.textContent='Enlace copiado. Abrilo solo en tu teléfono.';}catch{state.textContent='No se pudo copiar.';}}));
  const expires=Date.parse(c.expires_at);
  while(g===generation&&Date.now()<expires){
   state.textContent='Esperando autorización · '+Math.max(0,Math.ceil((expires-Date.now())/1000))+' s';
   await wait(2500);if(g!==generation)break;
   const session=await sb().auth.getSession();if(session.data.session){close();return;}
   const r=await api('claim',c.id,c.desktop);
   if(g!==generation)return;
   if(r.state==='ready'){
    active=null;
    const existing=await sb().auth.getSession();if(g!==generation||existing.data.session)return close();
    const result=await sb().auth.setSession({access_token:r.access_token,refresh_token:r.refresh_token});
    if(result.error)throw Error('No se pudo iniciar sesión. Generá otro QR.');
    close();return;
   }
   if(r.state!=='pending')break;
  }
  if(g===generation){active=null;state.textContent='El QR venció. Generá uno nuevo.';body.append(button('Generar nuevo QR',desktop));}
 }catch(e){if(g===generation){state.textContent=e.message||'No se pudo vincular.';body.append(button('Reintentar',desktop));}}
}
async function mobile(value){
 const m=valid.exec(value||'');const {body,state,g}=open('Autorizar ingreso en computadora');
 if(!m){state.textContent='El enlace no corresponde a un QR de GESTLOK.';return;}
 const [,id,proof]=m;
 try{
  const {data}=await sb().auth.getSession();
  if(g!==generation)return;
  if(!data.session){state.textContent='Este navegador no tiene tu sesión. Abrí la aplicación donde ya ingresaste y usá Mi perfil → Vincular computadora.';body.append(button('Copiar enlace',async()=>{try{await navigator.clipboard.writeText(location.origin+'/login/#glqr='+value);state.textContent='Enlace copiado.';}catch{state.textContent='No se pudo copiar.';}}));return;}
  const preview=await api('preview',id,proof,{},data.session.access_token);
  if(g!==generation)return;
  if(preview.state!=='pending'){state.textContent=preview.state==='unsupported'?'Usá el inicio habitual de esta cuenta.':'El QR venció o ya se utilizó.';return;}
  const code=el('strong',preview.code);code.style.cssText='font-size:30px;letter-spacing:5px;text-align:center';
  const check=el('input');check.type='checkbox';
  const label=el('label');label.append(check,document.createTextNode(' Confirmo que el código coincide con la computadora que tengo delante.'));
  const approve=button('Autorizar ingreso',async()=>{
   if(!check.checked||g!==generation)return;
   approve.disabled=true;
   try{
    const now=await sb().auth.getSession();if(!now.data.session||now.data.session.user.id!==data.session.user.id)throw Error('La cuenta cambió. Escaneá nuevamente.');
    const r=await api('approve',id,proof,{confirm:true,code:preview.code},now.data.session.access_token);
    if(g!==generation)return;
    if(r.state!=='approved')throw Error('La autorización venció o no está disponible.');
    body.replaceChildren();state.textContent='Ingreso autorizado. Tu sesión del teléfono permanece abierta.';
   }catch(e){if(g===generation)state.textContent=e.message;}
  });
  approve.disabled=true;check.addEventListener('change',()=>{approve.disabled=!check.checked;});
  body.append(el('p','Cuenta: '+data.session.user.email),el('p','Solo autorizá si vos generaste el QR en esa computadora. No autorices códigos recibidos por mensajes.'),code,label,approve);
  state.textContent='El código vence en dos minutos.';
 }catch(e){if(g===generation)state.textContent=e.message;}
}
function fromProfile(){
 const {body,state,g}=open('Vincular computadora');
 const input=el('input');input.type='url';input.placeholder='Pegá el enlace del QR';input.style.cssText='padding:10px;border:1px solid #cbd5e1;border-radius:8px;width:100%';
 body.append(el('p','Escaneá con la cámara del teléfono. Si el navegador no comparte tu sesión, copiá el enlace y pegalo acá.'),input,button('Continuar',()=>{
  try{const u=new URL(input.value.trim());if(u.origin!==location.origin||u.pathname!=='/login/'||!u.hash.startsWith('#glqr='))throw Error();mobile(u.hash.slice(6));}catch{state.textContent='Ingresá un enlace de GESTLOK válido.';}
 }));
 if('BarcodeDetector'in window&&navigator.mediaDevices?.getUserMedia){
  body.append(button('Escanear con cámara',async()=>{
   let stream;try{
    const detector=new window.BarcodeDetector({formats:['qr_code']});
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(g!==generation)return;
    const video=el('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.srcObject=stream;video.style.width='100%';body.prepend(video);await video.play();
    const end=Date.now()+30000;
    while(g===generation&&Date.now()<end){
     const codes=await detector.detect(video);
     const raw=codes[0]?.rawValue;
     if(raw){const u=new URL(raw);if(u.origin===location.origin&&u.pathname==='/login/'&&u.hash.startsWith('#glqr=')){await mobile(u.hash.slice(6));break;}}
     await wait(250);
    }
   }catch{if(g===generation)state.textContent='No se pudo escanear. Usá la cámara del teléfono y pegá el enlace.';}
   finally{stream?.getTracks().forEach(t=>t.stop());}
  }));
 }
}
function mount(){
 const form=document.querySelector('#au-in');
 if(form&&!form.querySelector('#gl-qr-login')){
  const b=button('Ingresar con QR',desktop);b.id='gl-qr-login';b.style.cssText+=';width:100%;margin:8px 0';
  const google=form.querySelector('[data-au="google"]');if(google)google.after(b);else form.prepend(b);
 }
 if(pair){const p=pair;pair='';void mobile(p);}
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-gl-qr-pair]')){e.preventDefault();fromProfile();}});
window.GestLokQrLogin={mount};
let attempts=0;const start=()=>{if(sb()?.auth&&window.qrcode){mount();return;}if(++attempts<100)setTimeout(start,100);};start();
})();
