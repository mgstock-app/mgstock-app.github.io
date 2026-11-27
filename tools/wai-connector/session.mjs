// Connection management only: no message listeners, outbound messages, or order mutations.
export const phoneKey = n => /^\+[1-9]\d{7,14}$/.test(n||'') ? n.replace(/^\+549(?=\d{10}$)/,'+54') : null;
export function createSession({id,number,exchange,transport,now=Date.now,logger=()=>{}}){
  let revision=null, socket=null,state='sin_senal',actual=null,qr=null,qrAt=0,retryAt=0,attempt=0,busy=false,closed=false,epoch=0;
  const wanted=phoneKey(number);
  if(!wanted)throw Error('Número inválido');
  const mark=(s)=>{state=s;actual=null;qr=null;qrAt=0;};
  async function end(){epoch++;const previous=socket;socket=null;if(previous)await previous.close();}
  async function connect(reset=false){
    const current=++epoch;
    mark('reconectando');
    try{
      socket=await transport({reset,onEvent:event=>{
        if(closed||current!==epoch)return;
        if(event.type==='qr'){
          if(typeof event.qr==='string'&&event.qr.length>=16&&event.qr.length<=2048){mark('qr');qr=event.qr;qrAt=now();}
          else mark('desconectado');
        }else if(event.type==='open'){
          const key=phoneKey(event.number);
          if(key!==wanted){mark('desconectado');retryAt=Infinity;void end().catch(()=>{});return;}
          mark('conectado');actual=event.number;attempt=0;retryAt=0;
        }else if(event.type==='close'){
          mark('desconectado');
          // Auth revoked / account mismatch / replacement: never silently force a new QR.
          retryAt=event.retryable?now()+Math.min(60000,2000*2**Math.min(attempt++,5)):Infinity;
          epoch++;socket=null;
        }
      }});
      if(closed||current!==epoch){await socket?.close();socket=null;}
    }catch{if(current===epoch){mark('desconectado');retryAt=now()+Math.min(60000,2000*2**Math.min(attempt++,5));}}
  }
  async function tick(){
    if(closed||busy)return;
    busy=true;
    try{
      const report={p_id:id,p_revision:revision,p_estado:state==='sin_senal'?null:state,p_numero:actual,p_qr:qr&&now()-qrAt<40000?qr:null};
      if(report.p_estado==='qr'&&!report.p_qr){report.p_estado='desconectado';}
      const result=await exchange(report);
      if(closed)return;
      if(!result||result.habilitada!==true||phoneKey(result.numero)!==wanted){
        mark('sin_senal');await end();revision=null;return;
      }
      if(typeof result.revision!=='string')throw Error('Respuesta de control inválida');
      if(result.revision!==revision){
        const reset=result.orden==='qr'&&revision!==null&&state!=='conectado';
        revision=result.revision;
        if(state!=='conectado'){await end();await connect(reset);}
      }else if(state==='desconectado'&&now()>=retryAt){
        await end();await connect(false);
      }
    }catch{
      // If control cannot be reached, close the transport rather than leave an unmanaged account.
      mark('sin_senal');revision=null;await end().catch(()=>{});logger('Sin acceso al control remoto; sesión pausada hasta nueva comprobación.');
    }finally{busy=false;}
  }
  async function close(){closed=true;mark('sin_senal');await end();}
  return {tick,close,state:()=>state};
}
