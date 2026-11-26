// Preview of *free-form customer-service* messages; never dispatches.
// Every outbound is disabled until the account owner authorizes a budget,
// provider connection, service-window check and deliverability monitoring.
const e164=/^\+[1-9]\d{7,14}$/;
export function projectYCloudText({from,to,messages=[],lastInboundAt,now=new Date()}){
 const fail=reason=>({reason,payloads:[],dispatchAllowed:false});
 if(!e164.test(from)||!e164.test(to)||from===to)return fail('invalid_numbers');
 if(!Array.isArray(messages)||messages.some(m=>typeof m!=='string'))return fail('invalid_messages');
 const timestamp=new Date(lastInboundAt).getTime(),current=new Date(now).getTime();
 // No templates, opt-ins or marketing: this preview only models the 24-hour
 // customer-service window and does not claim the window is open at YCloud.
 if(!Number.isFinite(timestamp)||!Number.isFinite(current)||current<timestamp||current-timestamp>=24*3600*1000)return fail('service_window_unverified');
 const raw=messages.filter(Boolean).join('\n\n');
 if(!raw)return fail('empty');
 const chunks=[];let rest=raw;
 while(rest.length){
  let take=Math.min(4000,rest.length);
  if(take<rest.length){const line=rest.lastIndexOf('\n',take);if(line>1000)take=line;}
  chunks.push(rest.slice(0,take));rest=rest.slice(take).replace(/^\n+/, '');
  if(chunks.length>10)return fail('too_many_messages');
 }
 return {reason:'preview_only',payloads:chunks.map(body=>({from,to,type:'text',text:{body}})),dispatchAllowed:false};
}
