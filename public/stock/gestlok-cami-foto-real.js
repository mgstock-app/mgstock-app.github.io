/* GESTLOK · BELISA / Camila · iluminación de fotografía real.
 * Mantiene todos los píxeles de la escena: NO elimina fondos, NO cambia texturas,
 * NO recorta ni inventa objetos. Edita localmente, sin IA ni servicios externos.
 */
const clamp01=v=>Math.max(0,Math.min(1,v));
const smooth=(v,a,b)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};

/** Puro: conserva la geometría, alfa, fondo, textura y color natural. */
export function mejorarLuzRealRGBA(pixels,width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||pixels?.length!==width*height*4)
  throw Error('La imagen no tiene dimensiones compatibles.');
 const output=new Uint8ClampedArray(pixels.length);
 const lum=new Float32Array(width*height);
 for(let i=0,p=0;i<lum.length;i++,p+=4){
  const r=pixels[p]/255,g=pixels[p+1]/255,b=pixels[p+2]/255;
  const y=.2126*r+.7152*g+.0722*b;
  lum[i]=y;
  // El fondo tejido oscuro permanece oscuro; las partes iluminadas del
  // producto reciben luz gradual, sin blanquear negros ni deformar colores.
  const chroma=Math.max(r,g,b)-Math.min(r,g,b);
  const light=.24*smooth(y,.055,.44)*(1-.55*smooth(y,.72,.98))*(1-.24*smooth(chroma,.2,.75));
  const gain=1+light;
  for(let ch=0;ch<3;ch++){
   let v=(pixels[p+ch]/255)*gain;
   // Compresión suave de brillos: cajas blancas sin áreas quemadas.
   if(v>.86)v=.86+.14*(1-Math.exp(-(v-.86)/.14));
   output[p+ch]=Math.round(clamp01(v)*255);
  }
  output[p+3]=pixels[p+3];
 }
 // Nitidez leve sobre letras/aristas, no sobre la textura negra ni el ruido.
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  const i=y*width+x,light=lum[i];
  if(light<.22)continue;
  const near=(lum[i-1]+lum[i+1]+lum[i-width]+lum[i+width])*.25;
  const detail=Math.max(-.04,Math.min(.04,light-near));
  const delta=255*.20*smooth(light,.22,.52)*detail;
  for(let ch=0;ch<3;ch++)output[i*4+ch]=Math.round(Math.max(0,Math.min(255,output[i*4+ch]+delta)));
 }
 return output;
}
async function abrirFoto(blob){
 if(typeof createImageBitmap==='function'){
  try{return await createImageBitmap(blob,{imageOrientation:'from-image'});}catch{}
 }
 const url=URL.createObjectURL(blob);
 try{
  return await new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('No se pudo abrir la foto.'));
   img.src=url;
  });
 }finally{URL.revokeObjectURL(url);}
}
const exportar=(canvas,quality)=>new Promise((resolve,reject)=>
 canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar la foto editada.')),'image/jpeg',quality)
);
export async function editarFotoReal(original,{onProgress}={}){
 onProgress?.('luz',0);
 const image=await abrirFoto(original);
 try{
  const sw=image.naturalWidth||image.width,sh=image.naturalHeight||image.height;
  if(sw<1||sh<1)throw Error('La foto no tiene dimensiones compatibles.');
  const ratio=Math.min(1,1800/Math.max(sw,sh));
  const w=Math.max(1,Math.round(sw*ratio)),h=Math.max(1,Math.round(sh*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Este dispositivo no permite editar la imagen.');
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,0,0,w,h);
  const frame=ctx.getImageData(0,0,w,h);
  onProgress?.('detalle',.65);
  frame.data.set(mejorarLuzRealRGBA(frame.data,w,h));
  ctx.putImageData(frame,0,0);
  let blob=await exportar(canvas,.93);
  if(blob.size>3*1024*1024)blob=await exportar(canvas,.84);
  if(blob.size>3*1024*1024)throw Error('La foto supera 3 MB incluso después de editarla.');
  onProgress?.('listo',1);
  return {blob,report:{width:w,height:h,mode:'fondo-real-preservado'}};
 }finally{image.close?.();}
}
