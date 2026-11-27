// Only public Gestlok catalog assets; never fetch a customer URL or follow redirects.
const MAX=2*1024*1024;
const STORAGE='https://irqeitzbfyerxcrogkyh.supabase.co';
const SITE='https://gestlok-prueba.vercel.app';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const storagePath=new RegExp('^/storage/v1/object/public/gestlok-chat-cartas/'+UUID+'/'+UUID+'\\.(?:jpg|jpeg|png|webp)$','i');
const staticPath=/^\/chat\/carta-wai\/[a-z0-9-]{1,70}\.jpg$/;
export function permittedMenuUrl(value){
 try{
  if(typeof value!=='string'||value.length>1500)return null;
  const u=new URL(value);
  if(u.username||u.password||u.search||u.hash)return null;
  return (u.origin===STORAGE&&storagePath.test(u.pathname)||u.origin===SITE&&staticPath.test(u.pathname))?u.href:null;
 }catch{return null;}
}
export async function loadMenuImage(value,{fetcher=fetch,convert=null}={}){
 const url=permittedMenuUrl(value);if(!url)throw Error('Imagen de carta no permitida');
 const res=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000),credentials:'omit',headers:{Accept:'image/jpeg,image/png,image/webp'}});
 if(!res.ok||res.redirected)throw Error('Imagen de carta no disponible');
 const mime=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||Number(res.headers.get('content-length'))>MAX||!res.body)throw Error('Formato de carta inválido');
 const reader=res.body.getReader(),chunks=[];let bytes=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX)throw Error('Carta demasiado grande');chunks.push(Buffer.from(value));}
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const buf=Buffer.concat(chunks);
 const jpeg=buf.length>4&&buf[0]===255&&buf[1]===216&&buf[2]===255;
 const png=buf.length>24&&buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=buf.length>16&&buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP';
 if(mime==='image/jpeg'&&jpeg)return {image:buf,mimetype:'image/jpeg'};
 if(mime==='image/png'&&png)return {image:buf,mimetype:'image/png'};
 if(mime==='image/webp'&&webp){
  const transcode=convert||(async b=>{const sharp=(await import('sharp')).default;return sharp(b,{limitInputPixels:16_000_000}).rotate().resize({width:1800,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();});
  const out=await transcode(buf);if(!Buffer.isBuffer(out)||out.length>MAX||out[0]!==255||out[1]!==216)throw Error('No se pudo convertir la carta');
  return {image:out,mimetype:'image/jpeg'};
 }
 throw Error('Contenido de imagen inválido');
}
