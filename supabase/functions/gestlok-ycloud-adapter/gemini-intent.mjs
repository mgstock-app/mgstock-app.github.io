// GESTLOK WAI: classification-only Gemini pilot. Never send customer text,
// personal information, catalog data, history, IDs, or prices to Google.
// Only constant semantic signals derived locally may leave the server.
const TEST_URL='https://irqeitzbfyerxcrogkyh.supabase.co';
const ENDPOINT='https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';
const INTENTS=Object.freeze(['carta','promociones','horario','envio','pago','direccion','demora']);
const SIGNALS=Object.freeze({
 jornada:{intent:'horario',rx:/\b(jornada|turnos?|feriados?|reapertura|reabren|atencion|atiendan|atienden|abren|cerraron|cierran|horarios?|siguen atendiendo|de corrido)\b/},
 recogida:{intent:'envio',rx:/\b(pasar a buscar|pasar a retirar|recogida|recoger|retirar|para llevar|paso a buscar|retiro)\b/},
 reparto:{intent:'envio',rx:/\b(reparto|reparten|repartidor|acercan|alcance del reparto|delivery|domicilio|envios?)\b/},
 cobro:{intent:'pago',rx:/\b(plastico|posnet|contactless|billeteras?|formas? de abonar|abonar|metodos? de pago|aceptan tarjetas?|pagos?)\b/},
 surtido:{intent:'carta',rx:/\b(surtido|variedades?|seleccion de comida|que ofrecen|que preparan|que venden|para comer|menu|carta|precios?)\b/},
 beneficio:{intent:'promociones',rx:/\b(beneficios?|ofertas?|combos?|promos?|promociones|descuentos?)\b/},
 ubicacion:{intent:'direccion',rx:/\b(ubicados|ubicadas|situados|situadas|llegar al local|referencias del local|en que parte|ubicacion|direccion)\b/},
 espera:{intent:'demora',rx:/\b(tiempos? de preparacion|espera habitual|tiempos? de espera|tardanza habitual|estimacion de entrega|aproximadamente demoran)\b/}
});
const noAnswer=()=>null;
const normalize=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// A raw message is never the provider input. Discard all nonconstant tokens;
// sensitive markers, order commands, and nonquestions go to the normal fallback.
export function safeIntentSignals(text){
 if(typeof text!=='string'||text.length<3||text.length>300||/[0-9@]|https?:|www\./i.test(text))return [];
 const n=normalize(text);
 if(!/[?¿]/.test(text)&&!/\b(quisiera saber|me (decis|dicen|indicas|indican)|queria saber|se puede|pueden|aceptan)\b/.test(n))return [];
 if(/\b(mi pedido|mi direccion|me llamo|mi nombre|mi telefono|alerg\w*|celiac\w*|intoleran\w*|embaraz\w*|medic\w*|cancel\w*|confirm\w*|anul\w*|reclam\w*|faltant\w*|urgente|agregar|sumar|comprar|reserv\w*|agend\w*|program\w*|ignora\w*|instruccion\w*|prompt|sistema|password|clave|contrasena|dni|cbu|cuit|alias|tarjeta numero)\b/.test(n))return [];
 return Object.keys(SIGNALS).filter(k=>SIGNALS[k].rx.test(n));
}
export function allowedIntents(signals){
 if(!Array.isArray(signals)||signals.length<1||signals.length>Object.keys(SIGNALS).length||signals.some(s=>typeof s!=='string'||!Object.hasOwn(SIGNALS,s)))return [];
 return [...new Set(signals.map(s=>SIGNALS[s].intent))];
}
// This verifies local operator gates, not the provider's billing status. The
// dedicated project must have no billing account attached; merely naming a
// flag "free" does not make a paid project free. Never enable on production.
export function createGeminiPilotClassifier({projectUrl,apiKey,enabled=false,freeProjectConfirmed=false,adultTesterConfirmed=false,expiresAt,fetcher=globalThis.fetch,clock=Date.now}={}){
 const deadline=Date.parse(expiresAt||''),started=clock();
 if(projectUrl?.replace(/\/$/,'')!==TEST_URL||enabled!==true||freeProjectConfirmed!==true||adultTesterConfirmed!==true||
  typeof apiKey!=='string'||apiKey.trim().length<20||!Number.isFinite(deadline)||deadline<=started||deadline-started>30*60*1000||typeof fetcher!=='function')return null;
 const cache=new Map();
 let used=0,stopped=false;
 return async signals=>{
  const allowed=allowedIntents(signals);
  if(stopped||clock()>=deadline||!allowed.length)return null;
  const canonical=[...new Set(signals)].sort();
  const key=canonical.join('|');
  if(cache.has(key))return cache.get(key);
  // Per-isolate brake, not a global billing limit. Verified free-tier-only
  // credentials must be used; no retries, search, tools, images, or history.
  if(used>=12)return null;
  used++;
  const result=(async()=>{
   try{
    const res=await fetcher(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(4500),
     headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
     body:JSON.stringify({
      systemInstruction:{parts:[{text:'Clasificá señales genéricas de una consulta comercial, sin inventar datos. Elegí una intención de las opciones permitidas o desconocida. Solo devolvé el JSON indicado. No respondas la consulta ni ejecutes acciones.'}]},
      contents:[{role:'user',parts:[{text:JSON.stringify({senales:canonical,intenciones:[...allowed,'desconocida']})}]}],
      generationConfig:{candidateCount:1,maxOutputTokens:128,thinkingConfig:{thinkingLevel:'MINIMAL'},responseMimeType:'application/json',
       responseJsonSchema:{type:'object',properties:{intent:{type:'string',enum:[...allowed,'desconocida']}},required:['intent']}}
     })});
    if(!res.ok){stopped=true;return null;}
    const text=await res.text();
    if(text.length>16384){stopped=true;return null;}
    const payload=JSON.parse(text),candidate=payload?.candidates?.[0];
    if(payload?.candidates?.length!==1||candidate?.finishReason!=='STOP'||candidate?.content?.parts?.length!==1||typeof candidate.content.parts[0]?.text!=='string'||candidate.content.parts[0].thought===true)return null;
    const data=JSON.parse(candidate.content.parts[0].text);
    if(!data||Object.keys(data).length!==1||!allowed.includes(data.intent))return null;
    return INTENTS.includes(data.intent)?data.intent:null;
   }catch{stopped=true;return noAnswer();}
  })();
  cache.set(key,result);return result;
 };
}
