// Even if multi-tenant routes were provisioned, the isolated live pilot must
// accept only the previously authorized tester and one commercial number.
// The invisible server-side allowlist is never sourced from request fields.
const e164=/^\+[1-9]\d{7,14}$/;
export function selectTestRoute({routes,waba,to,from}={}){
 if(!Array.isArray(routes)||typeof waba!=='string'||!waba||typeof to!=='string'||!e164.test(to)||
  typeof from!=='string'||!e164.test(from)||from===to)return null;
 const matches=routes.filter(r=>r&&r.waba===waba&&r.to===to);
 if(matches.length!==1)return null;
 const r=matches[0];
 if(!Array.isArray(r.allowSenders)||!r.allowSenders.includes(from))return null;
 // Keep the route's verified tenant/sucursal binding; ignore any extra senders.
 return {...r,allowSenders:[from]};
}
