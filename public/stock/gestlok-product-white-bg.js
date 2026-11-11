/* Mis Productos · fondo blanco local (Apache-2.0, @bg0/browser 0.1.1; BiRefNet MIT).
 * No se envía la foto a un servidor de recorte. Solo se guarda en Supabase después.
 * Dependencia bajo demanda, para no cargar el modelo en otros locales ni en el inicio.
 */
let model;
/* CDN alternativo de la misma versión Apache-2.0. El motor sólo procesa la foto
   localmente; si ambos proveedores fallan, se informa el problema al usuario. */
const CDNS=[
 'https://cdn.jsdelivr.net/npm/@bg0/browser@0.1.1/+esm',
 'https://esm.sh/@bg0/browser@0.1.1'
];
async function getModel(){
 if(!model)model=(async()=>{
  let failure;
  for(const url of CDNS){
   try{
    const m=await import(url);
    if(typeof m.removeBackground!=='function')throw Error('Motor incompatible');
    return m.removeBackground;
   }catch(err){failure=err;}
  }
  throw new Error('No se pudo descargar el editor de fondo blanco. Revisá tu conexión (preferentemente Wi-Fi) y tocá Reintentar.',{cause:failure});
 })().catch(e=>{model=null;throw e;});
 return model;
}
async function readImage(blob){
 const url=URL.createObjectURL(blob);
 try{
  return await new Promise((resolve,reject)=>{
   const img=new Image();
   img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('No se pudo abrir el recorte.'));
   img.src=url;
  });
 }finally{URL.revokeObjectURL(url);}
}
export async function whiteBackground(source,onProgress){
  const remove=await getModel();
  const result=await remove(source,{quality:'fast',onProgress});
  if(!result?.blob)throw Error('El editor no pudo separar el producto del fondo.');
  const img=await readImage(result.blob);
  const w=img.naturalWidth,h=img.naturalHeight;
  if(w<1||h<1||w*h>18000000)throw Error('La imagen no tiene un tamaño compatible.');
  const mask=document.createElement('canvas');mask.width=w;mask.height=h;
  const mc=mask.getContext('2d',{willReadFrequently:true});
  if(!mc)throw Error('No se pudo leer el recorte de la foto.');
  mc.drawImage(img,0,0);
  const a=mc.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=-1,maxY=-1,visible=0;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
    if(a[(y*w+x)*4+3]<25)continue;
    visible++;
    if(x<minX)minX=x;if(x>maxX)maxX=x;
    if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
  if(maxX<=minX||maxY<=minY||visible<100)
    throw Error('El producto no quedó completo en el recorte. Elegí otra foto con mejor luz.');
  const cw=maxX-minX+1,ch=maxY-minY+1;
  if(cw*ch>w*h*.985)throw Error('El fondo no se eliminó bien. Probá otra foto.');
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
  const c=canvas.getContext('2d');if(!c)throw Error('No se pudo componer la foto.');
  c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
  // Fotografía de catálogo: encuadre con márgenes iguales y apoyo visual real.
  // Respetar la ubicación, el texto, la forma y el color del producto original.
  const ratio=Math.min(980/cw,860/ch);
  const productW=cw*ratio,productH=ch*ratio;
  const productX=(1200-productW)/2,productY=1005-productH;
  const groundY=productY+productH+9;
  // Una sombra realista permanece sobre el suelo: nunca dibujar una silueta
  // completa desplazada que simule que el frasco flota en el aire.
  function groundShadow(x,y,rx,ry,strength){
    c.save();c.translate(x,y);c.scale(rx,ry);
    const gradient=c.createRadialGradient(0,0,0,0,0,1);
    gradient.addColorStop(0,'rgba(41,39,35,'+strength+')');
    gradient.addColorStop(.48,'rgba(41,39,35,'+(strength*.38)+')');
    gradient.addColorStop(1,'rgba(41,39,35,0)');
    c.fillStyle=gradient;c.beginPath();c.arc(0,0,1,0,2*Math.PI);c.fill();c.restore();
  }
  // Luz principal desde arriba/izquierda: sombra de contacto y proyección lateral
  // corta hacia la derecha, integrada con la base de frascos y cajas.
  groundShadow(productX+productW*.55,groundY,Math.max(98,productW*.50),23,.22);
  groundShadow(productX+productW*.67+Math.min(72,productW*.12),groundY+11,
    Math.max(160,productW*.63),45,.12);
  // Dibujar el producto tal como se recortó, sin reflejos inventados o blur.
  c.imageSmoothingEnabled=true;
  c.imageSmoothingQuality='high';
  c.drawImage(img,productX-minX*ratio,productY-minY*ratio,w*ratio,h*ratio);
  const blob=await new Promise((resolve,reject)=>{
    canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo exportar el catálogo.')),'image/jpeg',.94);
  });
  if(blob.size>3145728)throw Error('La foto es demasiado pesada para guardarla. Elegí otra con menos resolución.');
  return blob;
}
