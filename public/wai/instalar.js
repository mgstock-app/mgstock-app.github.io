/* GESTLOK WAI · instalar como app (Android/PC con el aviso del navegador; iPhone con Compartir → Agregar a inicio). */
(()=>{
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/wai/sw.js',{scope:'/wai/'}).catch(()=>{});
  if(standalone())return;
  let prompt=null;
  const box=document.createElement('aside');box.className='wai-install';box.hidden=true;box.setAttribute('aria-label','Instalar GESTLOK WAI');
  const text=document.createElement('span');
  const install=document.createElement('button');install.type='button';install.className='btn primary';install.textContent='Instalar app';
  const close=document.createElement('button');close.type='button';close.className='icon-btn';close.textContent='×';close.setAttribute('aria-label','Ocultar');
  box.append(text,install,close);document.body.append(box);
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;
  const hidden=()=>{try{return localStorage.getItem('gestlok-wai-instalar-oculto')==='1';}catch{return false;}};
  const show=mode=>{if(hidden())return;text.textContent=mode==='ios'?'Instalá GESTLOK WAI: tocá Compartir y después «Agregar a inicio».':'Instalá GESTLOK WAI en este equipo para abrirla como una app.';install.hidden=mode==='ios';box.hidden=false;};
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;show('app');});
  addEventListener('appinstalled',()=>{box.hidden=true;prompt=null;});
  install.onclick=async()=>{if(!prompt)return;prompt.prompt();try{await prompt.userChoice;}catch{}prompt=null;box.hidden=true;};
  close.onclick=()=>{box.hidden=true;try{localStorage.setItem('gestlok-wai-instalar-oculto','1');}catch{}};
  if(ios)show('ios');
})();
