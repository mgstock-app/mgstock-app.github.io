/* GESTLOK Plan Scanner · cámara tras un toque, lectura continua y liberación segura.
 * BarcodeDetector nativo primero; ZXing fijado en versión para Safari/iOS.
 * Solo procesa códigos dentro del dispositivo. No toma fotos ni graba video.
 */
(function(root){
'use strict';
const fallbackURL='https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js';
const supported=()=>!!root.navigator?.mediaDevices?.getUserMedia &&
  (typeof root.BarcodeDetector==='function'||!!root.document);
let loadingZXing=null;
function validCode(value){
 const code=String(value??'').trim();
 if(/^\d{13}$/.test(code)){
  const sum=[...code.slice(0,12)].reduce((s,d,i)=>s+Number(d)*(i%2?3:1),0);
  return (10-sum%10)%10===Number(code[12]);
 }
 if(/^\d{8}$/.test(code)){
  const sum=[...code.slice(0,7)].reduce((s,d,i)=>s+Number(d)*(i%2?1:3),0);
  return (10-sum%10)%10===Number(code[7]);
 }
 if(/^\d{12}$/.test(code)){
  const sum=[...code.slice(0,11)].reduce((s,d,i)=>s+Number(d)*(i%2?1:3),0);
  return (10-sum%10)%10===Number(code[11]);
 }
 // Code 128 incluye códigos comerciales alfanuméricos; el lector comprueba el checksum.
 return /^[A-Za-z0-9._-]{4,80}$/.test(code);
}
function loadZXing(){
 if(root.ZXingBrowser?.BrowserMultiFormatOneDReader)return Promise.resolve(root.ZXingBrowser);
 if(loadingZXing)return loadingZXing;
 if(!root.document?.createElement) return Promise.reject(Error('No se pudo iniciar el lector de este navegador.'));
 loadingZXing=new Promise((resolve,reject)=>{
  const script=root.document.createElement('script');
  script.src=fallbackURL;script.async=true;
  script.referrerPolicy='no-referrer';script.crossOrigin='anonymous';
  script.onload=()=>root.ZXingBrowser?.BrowserMultiFormatOneDReader
   ?resolve(root.ZXingBrowser)
   :reject(Error('El lector no se cargó correctamente.'));
  script.onerror=()=>{script.remove();reject(Error('No se pudo cargar el lector. Revisá la conexión a internet.'));};
  root.document.head.appendChild(script);
 }).catch(e=>{loadingZXing=null;throw e;});
 return loadingZXing;
}
function cameraError(e){
 if(e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError')
  return Error('Permití el acceso a la cámara para escanear desde el teléfono.');
 if(e?.name==='NotFoundError'||e?.name==='OverconstrainedError')
  return Error('No se encontró una cámara disponible en este dispositivo.');
 if(e?.name==='NotReadableError')
  return Error('Otra aplicación está usando la cámara. Cerrala e intentá de nuevo.');
 return e instanceof Error?e:Error('No se pudo abrir la cámara.');
}
async function scan(video,onCode,{signal,continuous=false}={}){
 if(!supported())throw Error('Este navegador no permite escanear. Ingresá el código manualmente.');
 if(!video||typeof onCode!=='function')throw Error('Falta la vista de cámara o el receptor del código.');
 if(signal?.aborted)throw Error('Escaneo cancelado.');
 let stopped=false,stream=null,frame=0,controls=null,lastCode='',lastAt=0;
 function stop(){
  if(stopped)return;
  stopped=true;
  if(frame)root.cancelAnimationFrame?.(frame);
  try{controls?.stop?.();}catch(_){}
  if(stream)stream.getTracks().forEach(track=>track.stop());
  try{video.pause?.();}catch(_){}
  video.srcObject=null;
  signal?.removeEventListener('abort',stop);
 }
 function deliver(raw){
  if(stopped)return;
  const code=String(raw||'').trim(),now=Date.now();
  if(!validCode(code)||code===lastCode||now-lastAt<350)return;
  lastCode=code;lastAt=now;
  if(!continuous)stop();
  try{onCode(code);}catch(_){/* El carrito maneja su propio error. */}
 }
 signal?.addEventListener('abort',stop,{once:true});
 if(signal?.aborted){stop();throw Error('Escaneo cancelado.');}
 video.setAttribute?.('playsinline','');
 video.muted=true;
 try{
  const native=typeof root.BarcodeDetector==='function';
  if(native){
   let formats=['ean_13','ean_8','upc_a','code_128'];
   if(typeof root.BarcodeDetector.getSupportedFormats==='function'){
    const available=await root.BarcodeDetector.getSupportedFormats();
    formats=formats.filter(f=>available.includes(f));
   }
   if(formats.length){
    const detector=new root.BarcodeDetector({formats});
    stream=await root.navigator.mediaDevices.getUserMedia({
     video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false
    });
    if(stopped){stream.getTracks().forEach(t=>t.stop());return stop;}
    video.srcObject=stream;
    await video.play();
    async function tick(){
     if(stopped)return;
     try{
      const codes=await detector.detect(video);
      const found=codes.find(v=>validCode(v.rawValue));
      if(found)deliver(found.rawValue);
     }catch(_){/* Algunos fotogramas no se pueden analizar. */}
     if(!stopped)frame=root.requestAnimationFrame(tick);
    }
    frame=root.requestAnimationFrame(tick);
    return stop;
   }
  }
  // Safari/iPhone y navegadores sin BarcodeDetector: alternativa de códigos 1D.
  const ZXing=await loadZXing();
  if(stopped)return stop;
  const reader=new ZXing.BrowserMultiFormatOneDReader();
  controls=await reader.decodeFromConstraints({
   video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false
  },video,(result)=>{
   if(!stopped&&result)deliver(typeof result.getText==='function'?result.getText():result.text);
  });
  if(stopped)controls?.stop?.();
  return stop;
 }catch(e){stop();throw cameraError(e);}
}
const api=Object.freeze({supported,scan,validCode});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosScanner=api;
})(typeof window!=='undefined'?window:globalThis);
