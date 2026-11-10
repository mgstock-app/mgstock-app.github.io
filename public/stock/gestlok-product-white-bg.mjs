/* Mis Productos · fondo blanco local (Apache-2.0, @bg0/browser 0.1.1; BiRefNet MIT).
 * No se envía la foto a un servidor de recorte. Solo se guarda en Supabase después.
 * Dependencia bajo demanda, para no cargar el modelo en otros locales ni en el inicio.
 */
let model;
async function getModel(){
 if(!model)model=import('https://cdn.jsdelivr.net/npm/@bg0/browser@0.1.1/+esm')
  .then(m=>{if(typeof m.removeBackground!=='function')throw Error('El motor de fondo blanco no está disponible.');return m.removeBackground;})
  .catch(e=>{model=null;throw e;});
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
 if(!result?.blob)throw Error('El recorte no produjo una imagen.');
 const img=await readImage(result.blob);
 const w=img.naturalWidth,h=img.naturalHeight;
 if(w<1||h<1||w*h>18000000)throw Error('El tamaño de imagen no es compatible.');
 const mask=document.createElement('canvas');mask.width=w;mask.height=h;
 const mc=mask.getContext('2d',{willReadFrequently:true});
 if(!mc)throw Error('No se pudo leer la silueta.');
 mc.drawImage(img,0,0);
 const a=mc.getImageData(0,0,w,h).data;
 let minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
  if(a[(y*w+x)*4+3]<25)continue;
  if(x<minX)minX=x;if(x>maxX)maxX=x;
  if(y<minY)minY=y;if(y>maxY)maxY=y;
 }
 if(maxX<=minX||maxY<=minY)throw Error('No se detectó el perfume. Probá con otra foto.');
 const cw=maxX-minX+1,ch=maxY-minY+1;
 if(cw*ch>w*h*.985)throw Error('El fondo no se eliminó correctamente. Probá con mejor iluminación.');
 const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
 const c=canvas.getContext('2d');if(!c)throw Error('No se pudo componer la foto.');
 c.fillStyle='#fff';c.fillRect(0,0,1200,1200);
 // Estilo fijo del catálogo de Camila: fondo blanco puro, producto auténtico
 // y sombra lateral proyectada a la derecha (luz suave desde arriba-izquierda).
 // No se modifican los píxeles, el texto ni los colores del producto.
 const ratio=Math.min(900/cw,900/ch);
 const productW=cw*ratio,productH=ch*ratio;
 const productX=(1100-productW)/2,productY=(1080-productH)/2;
 // Crear la silueta con el alfa real del recorte; no inventar frascos ni etiquetas.
 const silhouette=document.createElement('canvas');
 silhouette.width=cw;silhouette.height=ch;
 const sc=silhouette.getContext('2d');
 if(!sc)throw Error('No se pudo preparar la sombra del producto.');
 sc.drawImage(img,minX,minY,cw,ch,0,0,cw,ch);
 sc.globalCompositeOperation='source-in';
 sc.fillStyle='#20252a';sc.fillRect(0,0,cw,ch);
 sc.globalCompositeOperation='source-over';
 // La sombra siempre se dibuja ANTES del producto, para no tapar frasco ni caja.
 c.save();
 c.globalAlpha=.24;
 c.filter='blur(31px)';
 const reach=Math.min(168,Math.max(72,productH*.20));
 c.translate(productX+reach+.36*productH,productY+.90*productH);
 c.transform(ratio,0,-.36*ratio,.16*ratio,0,0);
 c.drawImage(silhouette,0,0,cw,ch);
 c.restore();
 // Sombra de contacto discreta en el apoyo: da profundidad sin efecto artificial.
 c.save();
 c.filter='blur(15px)';
 c.fillStyle='rgba(32,37,42,.17)';
 c.beginPath();
 c.ellipse(productX+productW/2+28,productY+productH+7,
   Math.max(125,productW*.48),Math.max(16,Math.min(35,productH*.045)),0,0,Math.PI*2);
 c.fill();
 c.restore();
 // Ajustar únicamente el encuadre del recorte real sobre el fondo blanco.
 c.drawImage(img,productX-minX*ratio,productY-minY*ratio,w*ratio,h*ratio);
 const blob=await new Promise((resolve,reject)=>{
  canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo crear la foto blanca.')),'image/jpeg',.87);
 });
 if(blob.size>3145728)throw Error('La foto editada es demasiado grande.');
 return blob;
}
