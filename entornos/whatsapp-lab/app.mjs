import {makeLab} from './model.mjs';
const $=id=>document.getElementById(id);
const labs={munro:makeLab('munro'),torcuato:makeLab('torcuato')};
const active=()=>labs[$('local').value];let busy=false;
const labels={accepted:'Mensaje procesado en simulación.',excluded_sender:'Número excluido: sin respuesta y sin guardar conversación.',duplicate:'Evento duplicado: ignorado.',invalid_message:'Evento rechazado (grupo, historial o inválido).',not_paired:'Ensayo desconectado.',quota_paused:'Pausa preventiva: no se procesa ni se envía.',blocked:'Protección activada: evento bloqueado.',no_event:'No hay evento anterior.'};
function render(){
 const lab=active(),s=lab.snapshot(),p=lab.controller.status(),q=lab.controller.readQr();
 for(const id of ['local','qr','exclude','near','limit','message'])$(id).disabled=busy;
 $('pair-state').textContent=p.state==='paired_simulated'?'Vinculado en simulación · envío bloqueado':q?'Esperando vinculación ficticia':'Desconectado';
 $('challenge').textContent=q?'Desafío ficticio (no escanear):\n'+q:'Sin desafío de vinculación.';
 $('pair').disabled=!q||busy;$('disconnect').disabled=p.state==='idle'||p.state==='disconnected'||busy;
 $('exclude').checked=s.excluded;$('exclusion').textContent=s.excluded?'Contacto interno excluido.':'Contacto interno permitido en el ensayo.';
 $('send').disabled=p.state!=='paired_simulated'||s.paused||busy;$('repeat').disabled=$('send').disabled||!s.last;$('group').disabled=$('send').disabled;
 $('quota').textContent=s.used+' / 900 unidades preventivas · '+(s.paused?'PAUSADO':s.used>=800?'AVISO: cerca del límite':'dentro del límite');
 $('bar').style.width=(100*s.used/900)+'%';$('continue').disabled=!s.paused||busy;$('pause').disabled=!s.paused||busy;$('advance').disabled=s.paused||busy;
 $('decision').textContent=s.decision==='continuar'?'Continuación solicitada. Sigue pausado hasta confirmación de presupuesto.':s.decision==='mantener_pausa'?'Pausa confirmada. No se habilitan envíos.':s.paused?'¿Querés solicitar continuar o mantener la pausa?':'Consumo ficticio independiente por sucursal. Sin medición real del proveedor.';
}
$('local').onchange=()=>{$('messages').textContent='Conversación de esta sucursal.';$('result').textContent='Sucursal de ensayo seleccionada.';render();};
$('qr').onclick=()=>{active().generate();render()};$('pair').onclick=()=>{active().pair();render()};$('disconnect').onclick=()=>{active().controller.disconnect();render()};$('exclude').onchange=()=>{active().exclude($('exclude').checked);render()};
async function process(options){
 const lab=active();busy=true;render();
 try{const result=await lab.send($('message').value,options);
 if(active()===lab){$('result').textContent=labels[result.status]||'Evento ignorado por seguridad.';$('messages').textContent=result.reply?.join('\n\n')||'Sin respuesta generada.';if(result.order&&result.status==='accepted')$('messages').textContent+='\n\nPedido simulado (no guardado ni enviado al local).';}}
 catch{$('result').textContent='Error: operación bloqueada.';}finally{busy=false;render();}
}
$('send').onclick=()=>process();$('repeat').onclick=()=>process({repeat:true});$('group').onclick=()=>process({group:true});
$('near').onclick=()=>{active().scenario(799);render()};$('limit').onclick=()=>{active().scenario(899);render()};$('advance').onclick=async()=>{busy=true;render();try{await active().advance()}finally{busy=false;render()}};
$('continue').onclick=()=>{active().decide('continuar');render()};$('pause').onclick=()=>{active().decide('mantener_pausa');render()};render();setInterval(render,1000);
