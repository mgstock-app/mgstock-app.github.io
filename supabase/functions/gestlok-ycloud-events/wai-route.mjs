// Read-only preflight, after official signed-event verification. It is NOT a
// send authorization; no text/customer content is persisted by this route.
// Derive tenant/local only from the verified number in the database.
export async function resolveWaiRoute(rpc,event){
 if(event?.kind!=='inbound'||event.status!==200||!event.args)return {status:'ignored',sendAllowed:false};
 const {p_waba,p_to,p_from}=event.args;
 const {data,error}=await rpc('gestlok_chat_srv_wai_ruta_verificada',{p_waba,p_to,p_from});
 if(error)throw Error('WAI route lookup failed');
 if(data===null)return {status:'ineligible',sendAllowed:false};
 if(!data?.habilitacion_id||!data.tenant_id||!data.sucursal_id||!data.local_id||!data.slug||
  !data.telefono_id||!data.numero_proveedor||!data.verificado_at||data.send_allowed!==false)
  throw Error('Invalid WAI route');
 return {status:'route_verified',route:data,sendAllowed:false};
}
