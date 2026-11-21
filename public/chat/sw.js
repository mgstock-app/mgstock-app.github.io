/* Service worker exclusivo para pedidos del cliente.
 * No comparte el PushManager ni el caché de la PWA administrativa. */
self.addEventListener('push', event => {
 event.waitUntil((async()=>{
  if(!event.data)return;
  let p;
  try{p=event.data.json()}catch{return}
  if(!p||typeof p!=='object')return;
  const slug=typeof p.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)&&p.slug.length<=60?p.slug:'';
  if(!slug)return;
  const title=String(p.title||'GESTLOK Chat').slice(0,100);
  const body=String(p.body||'Hay novedades en el chat.').slice(0,180);
  const url='/chat/?s='+encodeURIComponent(slug);
  await self.registration.showNotification(title,{
   body,icon:'/icons/gestlok-app-v2-192.png',badge:'/icons/gestlok-favicon-v2-32.png',
   tag:String(p.tag||'gestlok-chat').slice(0,70),data:{url}
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const target=new URL(event.notification.data?.url||'/chat/',self.location.origin);
  if(target.origin!==self.location.origin||target.pathname!=='/chat/')return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const open=windows.find(c=>c.url===target.href);
  if(open){await open.focus();return}
  await self.clients.openWindow(target.href);
 })());
});
