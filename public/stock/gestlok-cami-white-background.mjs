/* Mis Productos / Camila: recorte natural en el dispositivo.
 * IS-Net (Apache-2.0, Qin et al. DIS), ONNX adaptado por Ko033.
 * ONNX Runtime Web (MIT). Sin enviar fotos a servicios externos.
 * Carga diferida: el modelo (~90 MB) se descarga únicamente al editar.
 */
const RUNTIME='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
const MODEL='https://huggingface.co/Ko033/isnet-general-use-onnx/resolve/main/onnx/model_fp16.onnx';
const SIDE=1024;
let enginePromise=null;
function getEngine(){
 if(!enginePromise)enginePromise=(async()=>{
  const ort=await import(RUNTIME+'ort.min.mjs');
  ort.env.wasm.wasmPaths=RUNTIME;
  ort.env.wasm.numThreads=1;
  const model=await ort.InferenceSession.create(MODEL,{
   executionProviders:['wasm'],graphOptimizationLevel:'all'
  });
  return {ort,model};
 })().catch(e=>{enginePromise=null;throw e;});
 return enginePromise;
}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const readImage=file=>new Promise((resolve,reject)=>{
 const url=URL.createObjectURL(file),im=new Image();
 im.onload=()=>{URL.revokeObjectURL(url);resolve(im);};
 im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('No se pudo leer la foto.'));};
 im.src=url;
});
const asJpg=(c,quality=.88)=>new Promise((resolve,reject)=>{
 c.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo convertir la foto.')),'image/jpeg',quality);
});
export async function whiteBackground(file,{onProgress=()=>{}}={}){
 if(!(file instanceof Blob))throw Error('Seleccioná una fotografía JPG, PNG o WebP.');
 onProgress('Preparando foto real…');
 const im=await readImage(file);
 if(!im.naturalWidth||!im.naturalHeight)throw Error('La foto está vacía.');
 const src=canvas(SIDE,SIDE),sctx=src.getContext('2d',{willReadFrequently:true});
 sctx.drawImage(im,0,0,SIDE,SIDE);
 const pixels=sctx.getImageData(0,0,SIDE,SIDE).data;
 const area=SIDE*SIDE,values=new Float32Array(area*3);
 for(let i=0,k=0;i<area;i++,k+=4){
  values[i]=pixels[k]/255-.5;
  values[area+i]=pixels[k+1]/255-.5;
  values[2*area+i]=pixels[k+2]/255-.5;
 }
 onProgress('Cargando recorte automático (primera vez: descarga del modelo)…');
 const {ort,model}=await getEngine();
 onProgress('Separando el perfume del fondo…');
 const result=await model.run({input_image:new ort.Tensor('float32',values,[1,3,SIDE,SIDE])});
 const output=result.output_image||result[model.outputNames[0]];
 if(!output||output.data.length!==area)throw Error('El modelo no produjo un recorte válido.');
 const alpha=output.data;
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<alpha.length;i++){const v=alpha[i];if(v<lo)lo=v;if(v>hi)hi=v;}
 if(!(hi-lo>.00001))throw Error('No fue posible detectar el producto. Probá con más luz.');
 const alphaData=new Uint8ClampedArray(area*4);
 const scale=1/(hi-lo);
 for(let i=0,j=0;i<area;i++,j+=4){
  const a=Math.max(0,Math.min(1,(alpha[i]-lo)*scale));
  alphaData[j]=alphaData[j+1]=alphaData[j+2]=Math.round(255*a);
  alphaData[j+3]=255;
 }
 // Convertir máscara desde formato de inferencia a dimensiones originales sin deformar el envase.
 const mask=canvas(SIDE,SIDE);
 mask.getContext('2d').putImageData(new ImageData(alphaData,SIDE,SIDE),0,0);
 const maxSide=1450,ratio=Math.min(1,maxSide/Math.max(im.naturalWidth,im.naturalHeight));
 const w=Math.round(im.naturalWidth*ratio),h=Math.round(im.naturalHeight*ratio);
 const base=canvas(w,h),bctx=base.getContext('2d',{willReadFrequently:true});
 bctx.drawImage(im,0,0,w,h);
 const image=bctx.getImageData(0,0,w,h),rgba=image.data;
 const scaledMask=canvas(w,h),mctx=scaledMask.getContext('2d',{willReadFrequently:true});
 mctx.imageSmoothingEnabled=true;mctx.imageSmoothingQuality='high';
 mctx.drawImage(mask,0,0,w,h);
 const matte=mctx.getImageData(0,0,w,h).data;
 let minX=w,minY=h,maxX=0,maxY=0,foreground=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const pos=(y*w+x)*4,a=matte[pos]/255;
  if(a>.20){foreground++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
  const aa=Math.max(0,Math.min(1,(a-.045)/.91));
  rgba[pos]=Math.round(rgba[pos]*aa+255*(1-aa));
  rgba[pos+1]=Math.round(rgba[pos+1]*aa+255*(1-aa));
  rgba[pos+2]=Math.round(rgba[pos+2]*aa+255*(1-aa));
  rgba[pos+3]=255;
 }
 if(foreground<.012*w*h||foreground>.95*w*h||minX>maxX||minY>maxY){
  throw Error('No se detectó el producto con precisión. Sacá otra foto con más contraste.');
 }
 bctx.putImageData(image,0,0);
 // Fondo blanco y composición centrada. El producto no se reinventa ni se altera.
 const productW=maxX-minX+1,productH=maxY-minY+1;
 const padding=.11,frame=1200,inner=frame*(1-2*padding);
 const fit=Math.min(inner/productW,inner/productH);
 const dw=productW*fit,dh=productH*fit,dx=(frame-dw)/2,dy=(frame-dh)/2;
 const outputCanvas=canvas(frame,frame),octx=outputCanvas.getContext('2d');
 octx.fillStyle='#fff';octx.fillRect(0,0,frame,frame);
 octx.imageSmoothingEnabled=true;octx.imageSmoothingQuality='high';
 octx.drawImage(base,minX,minY,productW,productH,dx,dy,dw,dh);
 onProgress('Vista previa lista.');
 return asJpg(outputCanvas,.90);
}
