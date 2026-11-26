// Explicit, deterministic shortcuts for the WhatsApp pilot. No network, model
// invocation, cart mutation, inferred quantities or automatic confirmation.
import {normalizar,PAGOS} from '../motor.js';

export function parseQuantities(input) {
 const text=String(input??'').trim();
 // Do not interpret ordinary free-form customer messages as shortcuts.
 if(!/^\d+\s*[x×]\s*(?:\d|$)/i.test(text))return null;
 const parts=text.split(',');
 if(parts.length>8)return {ok:false};
 const entries=[],seen=new Set();
 for(const part of parts){
  const m=/^\s*([1-9]\d?)\s*[x×]\s*([1-9]\d?)\s*$/i.exec(part);
  if(!m)return {ok:false};
  const option=Number(m[1]),quantity=Number(m[2]);
  if(seen.has(option)||quantity>50)return {ok:false};
  seen.add(option);entries.push({option,quantity});
 }
 return {ok:true,entries};
}

// Natural Spanish syntax is accepted only for exact names on the active page.
// Ambiguous/unknown names are not guessed and no partial selection is applied.
export function parseNamedQuantities(input,options){
 const text=String(input??'').trim();
 if(!/^\d+\s+\S/.test(text))return null;
 const fail=()=>({ok:false});
 const parts=text.split(',');if(parts.length>8)return fail();
 const entries=[],seen=new Set();
 for(const part of parts){
  const m=/^\s*([1-9]\d?)\s+(?:de\s+)?(.+?)\s*$/i.exec(part);
  if(!m||Number(m[1])>50)return fail();
  const matches=options.filter(o=>normalizar(o.label)===normalizar(m[2]));
  if(matches.length!==1||seen.has(matches[0].number))return fail();
  const option=matches[0].number;seen.add(option);entries.push({option,quantity:Number(m[1])});
 }
 return {ok:true,entries};
}

export function normalizeCash(input){
 return String(input??'').trim().replace(/^\$\s*/, '').replace(/^(\d{1,3}(?:\.\d{3})+)(,\d{1,2})?$/,(_,whole,decimal='')=>whole.replaceAll('.','')+decimal.replace(',','.')).replace(',','.');
}

const fields={entrega:'entrega',nombre:'nombre',direccion:'direccion',pago:'medio_pago',abono:'efectivo_abona'};
export function parseCheckoutData(input){
 const m=/^datos\s*:\s*(.*)$/is.exec(String(input??'').trim());
 if(!m)return null;
 const fail=()=>({ok:false});
 const parts=m[1].split(';');
 if(parts.length>5)return fail();
 const data={};
 for(const part of parts){
  const pair=/^\s*([^=]+?)\s*=\s*(.+?)\s*$/s.exec(part);
  if(!pair)return fail();
  const key=normalizar(pair[1]);
  if(!Object.hasOwn(fields,key))return fail();
  const field=fields[key];if(Object.hasOwn(data,field))return fail();
  const raw=pair[2].trim(),value=normalizar(raw);
  if(!raw)return fail();
  if(field==='entrega'){
   if(!['retiro','delivery','envio'].includes(value))return fail();
   data[field]=value==='retiro'?'retiro':'envio';
  }else if(field==='medio_pago'){
   const method=Object.keys(PAGOS).find(k=>normalizar(k)===value||normalizar(PAGOS[k])===value);
   // normalizar maps underscores to spaces, including mercado_pago.
   if(!method)return fail();data[field]=method;
  }else if(field==='efectivo_abona'){
   const amount=normalizeCash(raw);
   if(!/^\d{1,8}(\.\d{1,2})?$/.test(amount))return fail();data[field]=amount;
  }else{
   if(raw.length<(field==='nombre'?2:5)||raw.length>(field==='nombre'?80:200))return fail();
   data[field]=raw;
  }
 }
 return {ok:true,data};
}

// Only exact, standalone acknowledgments AFTER the request/derivation; never
// silence questions, complaints, negotiation, or answers inside an active order.
export function isCourtesy(input){
 return /^¡?\s*(?:muchas gracias|gracias|ok|okay|okey|perfecto|entendido|de acuerdo)[.!\s]*$/i.test(String(input??'').trim());
}
