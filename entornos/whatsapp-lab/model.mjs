// Simulation only. No network, credentials, stored data, or provider.
import {createQrPairingSimulation} from './runtime/scripts/gestlok-qr-pilot/pairing.mjs';
import {reserveSimulatedQuota} from './runtime/supabase/functions/gestlok-ycloud-adapter/quota.mjs';
const branches={munro:['01','Munro'],torcuato:['02','Don Torcuato']};
const syntheticSender='+5491100000000';
export function makeLab(local, now=Date.now){
 const branch=branches[local]; if(!branch)throw Error('Sucursal inválida');
 const route={to:'+54911000000'+branch[0],empresa:'ficticia',sucursal:local,sucursalId:'a0000000-0000-4000-8000-0000000000'+branch[0],slug:local,allowSenders:[syntheticSender]};
 let excluded=false,used=0,paused=false,decision='pendiente',last=null,lastReply=[],seq=0,order=null;
 const sessions=new Map(),events=new Set(),reservations=new Set();
 const store={
  isExcluded:async()=>excluded,
  load:async ({scope})=>({revision:sessions.get(scope)?.revision||0,state:sessions.get(scope)?.state||null,
   sucursal:{nombre:branch[1]+' ficticio',empresa:'Comercio de ensayo',slug:local,acepta_retiro:true,acepta_envio:true,envio_costo:500,medios_pago:['efectivo'],menu_interactivo:true},
   catalogo:{categorias:[{id:'emp',nombre:'Empanadas',activa:true}],productos:[
    {id:'carne',categoria_id:'emp',nombre:'Empanada de carne ficticia',precio:1000,activo:true,disponible:true,opciones:[]},
    {id:'queso',categoria_id:'emp',nombre:'Empanada de queso ficticia',precio:1000,activo:true,disponible:true,opciones:[]}]},
   privado:{ia_activa:false}}),
  commit:async a=>{if(events.has(a.eventId))return {status:'duplicate'};
   events.add(a.eventId);sessions.set(a.scope,{revision:a.revision+1,state:a.state});lastReply=a.reply;order=a.order||order;return {status:'committed'};}
 };
 const controller=createQrPairingSimulation({projectRef:'irqeitzbfyerxcrogkyh',enabled:true,dryRunOnly:true,route,store,now});
 async function advance(){
  if(paused)return {reserved:false,sendAllowed:false,reason:'paused'};
  const key=String(++seq).padStart(64,'0');
  return reserveSimulatedQuota({from:route.to,messageKey:key,units:1,sucursal:route.sucursalId,rpc:async (_fn,args)=>{
   if(reservations.has(args.p_message_key))return {data:{simulated:true,sendAllowed:false,reserved:false,reason:'duplicate'}};
   if(used>=900){paused=true;return {data:{simulated:true,sendAllowed:false,reserved:false,reason:'limit_reached',remaining:0,aviso:'consulta',pausado:true}};}
   reservations.add(args.p_message_key);used++;if(used>=900)paused=true;
   return {data:{simulated:true,sendAllowed:false,reserved:true,reason:'simulated_reservation',remaining:900-used,aviso:paused?'consulta':used>=800?'cerca_del_limite':'normal',pausado:paused}};
  }});
 }
 async function send(text,{repeat=false,group=false}={}){
  if(paused)return {status:'quota_paused',sendAllowed:false,reply:[]};
  if(repeat&&!last)return {status:'no_event',sendAllowed:false,reply:[]};
  if(!repeat)last={synthetic:true,type:'chat',from:syntheticSender,to:route.to,body:String(text).slice(0,600),timestamp:now(),id:'evt-'+(++seq),group};
  lastReply=[];const r=await controller.receive(last);
  if(r.status==='accepted'&&lastReply.length)await advance();
  return {...r,reply:[...lastReply],order:order?true:false};
 }
 return {controller,route,send,advance,exclude:value=>{excluded=value===true;},snapshot:()=>({excluded,used,paused,decision,last:!!last,order:!!order,sendAllowed:false}),
  generate(){controller.disconnect();controller.open();const challenge='FICTICIO-QR-'+crypto.randomUUID();return controller.offerQr(challenge)?challenge:null;},
  pair(){return controller.pair({numero:route.to,challenge:controller.readQr()});},
  scenario(n){if(n!==799&&n!==899)return false;used=n;paused=false;decision='pendiente';return true;},
  decide(v){if(!paused||!['continuar','mantener_pausa'].includes(v))return false;decision=v;return true;}};
}
