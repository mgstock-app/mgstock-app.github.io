// Diagnostic only. No message sends, no customer content, no database writes.
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(data:Record<string,unknown>,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(env("SUPABASE_URL").replace(/\/$/,"")!=="https://irqeitzbfyerxcrogkyh.supabase.co")return reply({ok:false},503);
 // Supabase new secret-key authentication: never authorize a publishable key.
 let expected="";
 try{const keys=JSON.parse(env("SUPABASE_SECRET_KEYS"));if(typeof keys.default==="string")expected=keys.default;}catch{/* fail closed */}
 const provided=req.headers.get("apikey")||"";
 if(!expected.startsWith("sb_secret_")||expected.length<24||!provided.startsWith("sb_secret_")||provided.length!==expected.length)return reply({ok:false},403);
 const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
 const a=await digest(expected),b=await digest(provided);let diff=0;
 for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 if(diff!==0)return reply({ok:false},403);
 if(req.method!=="POST")return reply({ok:false},405);
 const key=env("YCLOUD_API_KEY");
 if(!key)return reply({ok:false,reason:"secret_missing"},503);
 try{
 const res=await fetch("https://api.ycloud.com/v2/webhookEndpoints/6b0791a4075fb113eab3b8d1",{method:"GET",headers:{"X-API-Key":key,"Accept":"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});
 if(!res.ok){await res.body?.cancel();return reply({ok:false,provider_status:res.status},502);}
 const ep=await res.json();
 const url="https://irqeitzbfyerxcrogkyh.supabase.co/functions/v1/gestlok-ycloud-webhook";
 const secret=env("YCLOUD_WEBHOOK_SECRET");
 const flags={endpoint_active:ep.status==="active",url_correct:ep.url===url,inbound_event:Array.isArray(ep.events)&&ep.events.includes("whatsapp.inbound_message.received"),signing_secret_matches:!!secret&&ep.secret===secret,pilot_enabled:env("YCLOUD_PILOT_ENABLED")==="true",waba_configured:env("YCLOUD_PILOT_WABA")==="4470112546605042",destination_configured:env("YCLOUD_PILOT_NUMBER")==="+5491176617182",test_sender_configured:/^\\+[1-9]\\d{7,14}$/.test(env("YCLOUD_TEST_SENDER"))&&env("YCLOUD_TEST_SENDER")!==env("YCLOUD_PILOT_NUMBER")};
 return reply({ok:Object.values(flags).every(Boolean),provider_status:res.status,...flags});
 }catch{return reply({ok:false,reason:"provider_unreachable"},502);}
});