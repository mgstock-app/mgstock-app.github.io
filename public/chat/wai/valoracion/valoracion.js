(() => {
'use strict';
const root=document.getElementById('feedback'),token=location.hash.slice(1);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,cls,fn)=>{const n=el('button',text,'btn '+cls);n.type='button';n.addEventListener('click',fn);return n;};
function brand(){const n=el('div',null,'brand'),im=el('img');im.src='/chat/gestlok-monograma.svg';im.alt='';n.append(im,el('strong','GESTLOK WAI'));return n;}
function screen(title,subtitle,...children){root.replaceChildren(brand(),el('h1',title),el('p',subtitle),...children);}
let client,busy=false;
async function rpc(action,detail=null,photo=null){
 const r=await client.rpc('gestlok_chat_wai_valoracion',{p_token:token,p_accion:action,p_detalle:detail,p_foto:photo});
 if(r.error)throw Error('No pudimos guardar tu respuesta. Reintentá.');
 return r.data;
}
async function jpeg(file){
 if(!file)return null;
 if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10*1024*1024)throw Error('Elegí una foto JPG, PNG o WEBP de hasta 10 MB.');
 const bmp=await createImageBitmap(file);
 try{
  const canvas=document.createElement('canvas'),ratio=Math.min(1,1000/Math.max(bmp.width,bmp.height));
  canvas.width=Math.max(1,Math.round(bmp.width*ratio));canvas.height=Math.max(1,Math.round(bmp.height*ratio));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp,0,0,canvas.width,canvas.height);
  for(const quality of [.82,.65,.45,.3]){const encoded=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(encoded&&encoded.length<=400000)return encoded;}
  throw Error('La foto es demasiado grande. Elegí otra.');
 }finally{bmp.close();}
}
function render(data){
 if(!data){screen('Consulta no disponible','Este enlace no es válido o la prueba finalizó. Podés comunicarte con el local por WhatsApp.');return;}
 if(data.valoracion==='bien'){screen('¡Muchas gracias!','Nos alegra que hayas recibido bien tu pedido. Gracias por elegirnos.');return;}
 if(data.valoracion==='problema'){
  if(data.detalles_enviados||data.resuelto){screen('Recibimos tu reclamo','Lamentamos el inconveniente. El local recibió tu respuesta.');return;}
  const form=el('form',null,'form'),text=el('textarea'),file=el('input'),status=el('p',null,'response-status');status.setAttribute('role','status');
  text.maxLength=1000;text.rows=4;text.placeholder='Contanos qué pasó con tu pedido';
  file.type='file';file.accept='image/jpeg,image/png,image/webp';
  const l1=el('label','Detalle del problema'),l2=el('label','Foto (opcional)');l1.append(text);l2.append(file);
  const submit=el('button','Enviar detalle al local','btn primary');submit.type='submit';
  form.append(l1,l2,el('p','La foto se guarda junto con tu reclamo. Solo el personal autorizado del local puede verla.','privacy'),submit,status);
  form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;if(!text.value.trim()&&!file.files[0]){status.textContent='Agregá un detalle o una foto.';return;}busy=true;submit.disabled=true;status.textContent='Enviando…';try{const photo=await jpeg(file.files[0]);render(await rpc('detalle',text.value.trim()||null,photo));}catch(e){status.textContent=e.message;}finally{busy=false;submit.disabled=false;}});
  screen('Lamentamos el inconveniente','Ya avisamos al local que tuviste un problema. Si podés, contanos qué pasó y adjuntá una foto.',form);return;
 }
 const choices=el('div',null,'choices'),status=el('p',null,'response-status');status.setAttribute('role','status');
 async function choose(action){if(busy)return;busy=true;for(const b of choices.children)b.disabled=true;status.textContent='Guardando respuesta…';try{render(await rpc(action));}catch(e){status.textContent=e.message;}finally{busy=false;for(const b of choices.children)b.disabled=false;}}
 choices.append(btn('✓ Recibí bien mi pedido','primary choice',()=>void choose('bien')),btn('Tuve un problema con mi pedido','problem choice',()=>void choose('problema')));
 screen('¿Cómo llegó tu pedido?','Tu respuesta le llegará al local.',choices,status,el('p','No necesitás ingresar a ninguna cuenta.','privacy'));
}
(async()=>{try{
 if(!/^[a-f0-9]{64}$/.test(token)||!['prueba','testing'].includes(window.GESTLOK_CHAT_CONFIG?.entorno)){render(null);return;}
 const C=window.GESTLOK_CHAT_CONFIG;client=window.supabase.createClient(C.url,C.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 render(await rpc('ver'));
 }catch{screen('No pudimos abrir la consulta','Revisá tu conexión e intentá abrir el enlace nuevamente.');}})();
})();
