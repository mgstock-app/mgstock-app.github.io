/* GESTLOK Chat · puente de demostración entre cliente y gerente.
 * Solo se activa con ?demo=1&showroom=1. Usa sessionStorage del mismo
 * navegador; no accede a Supabase, no emite pedidos ni mensajes reales.
 * No lo uses como fuente de datos fuera del modo demo.
 */
(function(){
  'use strict';
  const p=new URLSearchParams(location.search);
  const enabled=p.get('demo')==='1'&&p.get('showroom')==='1';
  const KEY='gestlok:chat-showroom:v1';
  const empty=()=>({version:1,order:null,messages:[],seq:0,updated:0});
  function read(){
    if(!enabled)return empty();
    try {
      const d=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(d?.version===1&&Array.isArray(d.messages)&&d.messages.length<=100&&
        Number.isSafeInteger(d.seq)&&d.seq>=0&&(!d.order||typeof d.order==='object'))return d;
    }catch{}
    return empty();
  }
  function write(d){
    if(!enabled)return;
    d.version=1;d.updated=Date.now();
    d.messages=d.messages.slice(-80);
    try{sessionStorage.setItem(KEY,JSON.stringify(d));}catch{}
  }
  function add(role,text){
    if(!enabled||!['cliente','asistente','local'].includes(role))return null;
    const d=read();
    const m={id:++d.seq,rol:role,texto:String(text||'').slice(0,1000)};
    if(!m.texto.trim())return null;
    d.messages.push(m);write(d);return m;
  }
  function order(order){
    if(!enabled||!order||typeof order!=='object')return null;
    const d=read();
    const v={...order,id:'showroom-orden-'+Date.now(),conversacion_id:'showroom-conversacion',
      codigo:'DEMO-'+String(Date.now()).slice(-6),estado:'pendiente',motivo:'',
      creado_at:new Date().toISOString()};
    d.order=v;write(d);return v;
  }
  function decide(id,decision,motivo){
    if(!enabled)return false;
    const d=read(),o=d.order;
    if(!o||o.id!==id)return false;
    if(!((o.estado==='pendiente'&&['confirmado','rechazado','cancelado'].includes(decision))||
       (o.estado==='confirmado'&&['terminado','rechazado'].includes(decision))))return false;
    o.estado=decision;o.motivo=String(motivo||'').slice(0,200);
    if(decision==='confirmado')o.confirmado_at=new Date().toISOString();
    addState(d,'asistente',decision==='confirmado'?'El gerente confirmó el pedido.':
      decision==='terminado'?'Su pedido ya está listo.':
      decision==='rechazado'?'El gerente rechazó el pedido. '+o.motivo:'Su pedido fue cancelado.');
    write(d);return true;
  }
  function addState(d,role,text){
    d.messages.push({id:++d.seq,rol:role,texto:String(text).slice(0,1000)});
  }
  function reset(){
    if(!enabled)return;
    try{sessionStorage.removeItem(KEY);}catch{}
  }
  window.GestLokChatShowroom=Object.freeze({enabled,read,add,order,decide,reset,key:KEY});
})();
