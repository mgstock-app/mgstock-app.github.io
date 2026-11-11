/* Mis Productos (ZAYRO) · separar el producto del fondo, en el teléfono.
 * Motor: @bg0/browser 0.1.1 (Apache-2.0) con BiRefNet (MIT). Gratis y sin servidor:
 * la foto no se envía a ningún servicio de recorte. Se descarga solo al usarlo.
 * Devuelve la máscara (canal alfa); el color siempre se toma de la foto real.
 */
let model;
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
  throw new Error('No se pudo descargar el editor de fotos. Revisá tu conexión (mejor con Wi-Fi) y tocá Reintentar.',{cause:failure});
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
export async function recortarProducto(source,onProgress){
 const remove=await getModel();
 // «quality» refina la máscara: la opción rápida pierde bordes de frascos y letras.
 const result=await remove(source,{quality:'quality',onProgress});
 if(!result?.blob)throw Error('El editor no pudo separar el producto del fondo.');
 const img=await readImage(result.blob);
 const w=img.naturalWidth,h=img.naturalHeight;
 if(w<1||h<1||w*h>18000000)throw Error('La imagen no tiene un tamaño compatible.');
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const x=c.getContext('2d',{willReadFrequently:true});
 if(!x)throw Error('No se pudo leer el recorte de la foto.');
 x.drawImage(img,0,0);
 return {width:w,height:h,data:x.getImageData(0,0,w,h).data};
}
