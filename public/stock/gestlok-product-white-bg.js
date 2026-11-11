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

// Iluminación local de estudio sin servicio externo. No reconstruye zonas
// ilegibles: el detalle disponible siempre sale de la foto real.
// El modelo neuronal BiRefNet se ocupa del fondo; este paso corrige luces.
// Función pura para poder comprobar sombras, envases negros y transparencias.
export function balanceStudioLighting(pixels){
 const smooth=(x,a,b)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
 };
 for(let p=0;p<pixels.length;p+=4){
  const alpha=pixels[p+3];
  if(alpha<248)continue; // No aumentar halos en los bordes de vidrio y etiquetas.
  const red=pixels[p],green=pixels[p+1],blue=pixels[p+2];
  const light=.2126*red+.7152*green+.0722*blue;
  const chroma=Math.max(red,green,blue)-Math.min(red,green,blue);
  // Papel y cajas neutras tienen sombras de luz, mientras que los tapones
  // negros muy oscuros y los líquidos coloreados requieren protección.
  const neutral=1-smooth(chroma,28,105);
  const material=smooth(light,48,107);
  const shaded=1-smooth(light,176,238);
  const correction=Math.min(90,Math.max(0,228-light)*.77*neutral*material*shaded);
  // Levantar medios tonos en vidrio de color, sin desaturar el líquido.
  const colorLift=Math.min(14,Math.max(0,175-light)*.105*(1-neutral)*smooth(light,58,112));
  const lift=correction+colorLift;
  for(let channel=0;channel<3;channel++){
   const value=pixels[p+channel];
   pixels[p+channel]=Math.min(255,Math.max(0,value+lift));
  }
 }
 return pixels;
}

export async function whiteBackground(source,onProgress){
  const remove=await getModel();
  // Usar el refinado de máscara: la opción fast pierde bordes de frascos y tipografías.
  const result=await remove(source,{quality:'quality',onProgress});
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
  // Foto de catálogo: fondo #fff plano, sin sombras proyectadas ni de contacto.
  // La caja, el frasco, el texto y la disposición provienen del recorte original.
  const ratio=Math.min(1020/cw,850/ch);
  const productW=cw*ratio,productH=ch*ratio;
  const productX=(1200-productW)/2,productY=1000-productH;

  // Editar solo el producto, conservando la transparencia y todos sus detalles.
  // Corrección tonal suave: levantar medios tonos de una foto oscura sin
  // inventar reflejos, redibujar etiquetas ni modificar la geometría real.
  const subject=document.createElement('canvas');
  subject.width=1200;subject.height=1200;
  const sc=subject.getContext('2d',{willReadFrequently:true});
  if(!sc)throw Error('No se pudo mejorar la foto del producto.');
  sc.imageSmoothingEnabled=true;
  sc.imageSmoothingQuality='high';
  sc.filter='brightness(1.10) contrast(1.035) saturate(1.045)';
  sc.drawImage(img,productX-minX*ratio,productY-minY*ratio,w*ratio,h*ratio);
  sc.filter='none';

  // Enfoque moderado: realza bordes interiores y letras existentes.
  // Evitar halos en los bordes de la máscara de transparencia.
  const soft=document.createElement('canvas');soft.width=1200;soft.height=1200;
  const bc=soft.getContext('2d',{willReadFrequently:true});
  if(bc){
    bc.filter='blur(1px)';
    bc.drawImage(subject,0,0);
    const sharp=sc.getImageData(0,0,1200,1200);
    const pixels=sharp.data,blurred=bc.getImageData(0,0,1200,1200).data;
    for(let p=0;p<pixels.length;p+=4){
      if(pixels[p+3]<250||blurred[p+3]<245)continue;
      for(let k=0;k<3;k++){
        const detail=pixels[p+k]-blurred[p+k];
        // Enfoque moderado para no inventar caracteres ni crear bordes brillantes.
        const focused=Math.abs(detail)>4&&Math.abs(detail)<65?detail*.42:0;
        pixels[p+k]=Math.max(0,Math.min(255,pixels[p+k]+focused));
      }
    }
    balanceStudioLighting(pixels);
    sc.putImageData(sharp,0,0);
  }
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  c.drawImage(subject,0,0);
  const blob=await new Promise((resolve,reject)=>{
    canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo exportar el catálogo.')),'image/jpeg',.94);
  });
  if(blob.size>3145728)throw Error('La foto es demasiado pesada para guardarla. Elegí otra con menos resolución.');
  return blob;
}
