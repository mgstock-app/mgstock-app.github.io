/* POS browser input adapter: manual entry, USB/Bluetooth keyboard-wedge scanner,
 * and optional mobile camera. No payment or inventory changes.
 */
(function(root){
'use strict';
function attach({input,video,cameraButton,onCode,onError}){
 if(!input||typeof onCode!=='function')throw Error('Falta el campo o el receptor de códigos.');
 let stopCamera=null,disposed=false;
 const report=e=>{if(typeof onError==='function')onError(e);};
 function accept(value){
  const code=String(value||'').trim();
  if(!code||disposed)return false;
  onCode(code);
  input.value='';
  return true;
 }
 function keydown(event){
  if(event.key==='Enter'){
   event.preventDefault();
   accept(input.value);
  }
 }
 async function openCamera(){
  if(disposed)return;
  if(!video||!root.GestLokPosScanner?.supported()){
   report(Error('Cámara no disponible: usá el código manual o lector externo.'));
   return;
  }
  if(stopCamera){stopCamera();stopCamera=null;}
  try{
   stopCamera=await root.GestLokPosScanner.scan(video,code=>{
    stopCamera=null;
    accept(code);
   });
  }catch(e){report(e);}
 }
 input.addEventListener('keydown',keydown);
 cameraButton?.addEventListener('click',openCamera);
 return ()=>{
  disposed=true;
  input.removeEventListener('keydown',keydown);
  cameraButton?.removeEventListener('click',openCamera);
  stopCamera?.();
  stopCamera=null;
 };
}
const api=Object.freeze({attach});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosInput=api;
})(typeof window!=='undefined'?window:globalThis);
