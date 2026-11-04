/* Camera barcode reader: explicit user action, manual input always available. */
(function(root){
'use strict';
const supported=()=>typeof root.BarcodeDetector==='function'&&!!root.navigator?.mediaDevices?.getUserMedia;
async function scan(video,onCode,{signal}={}){
 if(!supported())throw Error('Este navegador no permite escanear. Ingresá el código manualmente.');
 if(!video||typeof onCode!=='function')throw Error('Falta la vista de cámara o el receptor del código.');
 if(signal?.aborted)throw Error('Escaneo cancelado.');
 const detector=new root.BarcodeDetector({formats:['ean_13']});
 const stream=await root.navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
 let stopped=false,frame=0;
 function stop(){
  if(stopped)return;
  stopped=true;
  if(frame)root.cancelAnimationFrame(frame);
  stream.getTracks().forEach(track=>track.stop());
  video.pause();
  video.srcObject=null;
  signal?.removeEventListener('abort',stop);
 }
 signal?.addEventListener('abort',stop,{once:true});
 if(signal?.aborted){stop();throw Error('Escaneo cancelado.');}
 try{
  video.srcObject=stream;
  video.setAttribute('playsinline','');
  await video.play();
  async function tick(){
   if(stopped)return;
   try{
    const codes=await detector.detect(video);
    const valid=s=>/^\d{13}$/.test(s)&&((10-[...s.slice(0,12)].reduce((sum,d,i)=>sum+Number(d)*(i%2?3:1),0)%10)%10===Number(s[12]));
    const code=codes.find(x=>typeof x.rawValue==='string'&&valid(x.rawValue.trim()));
    if(code){stop();onCode(code.rawValue.trim());return;}
   }catch(_e){/* Some frames are not decodable; keep scanning. */}
   if(!stopped)frame=root.requestAnimationFrame(tick);
  }
  frame=root.requestAnimationFrame(tick);
  return stop;
 }catch(e){stop();throw e;}
}
const api=Object.freeze({supported,scan});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosScanner=api;
})(typeof window!=='undefined'?window:globalThis);
