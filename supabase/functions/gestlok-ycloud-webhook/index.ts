// YCloud pilot: signature and routing verification only. No persistence, no outbound calls.
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(env("SUPABASE_URL").replace(/\/$/,"")!=="https://irqeitzbfyerxcrogkyh.supabase.co")return reply(503);
 if(req.method!=="POST")return reply(405);
 const secret=env("YCLOUD_WEBHOOK_SECRET");
 if(secret.length<24||env("YCLOUD_PILOT_ENABLED")!=="true")return reply(503);
 const header=req.headers.get("ycloud-signature")||"";
 const m=header.match(/^t=(\d{10}),\s*s=([a-fA-F0-9]{64})$/);
 if(!m||Math.abs(Date.now()/1000-Number(m[1]))>300)return reply(403);
 const reader=req.body?.getReader();if(!reader)return reply(400);
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return reply(413);}chunks.push(value);}}catch{return reply(400);}
 const prefix=new TextEncoder().encode(m[1]+".");const bytes=new Uint8Array(prefix.length+size);bytes.set(prefix);let off=prefix.length;for(const c of chunks){bytes.set(c,off);off+=c.length;}
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const sig=Uint8Array.from(m[2].match(/../g)!,x=>parseInt(x,16));
 if(!await crypto.subtle.verify("HMAC",key,sig,bytes))return reply(403);
 let p;try{p=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(prefix.length)));}catch{return reply(400);}
 const v=p?.whatsappInboundMessage;
 // Only a consented test sender, matching WABA and destination, and a fixed fictitious test phrase.
 const from=env("YCLOUD_TEST_SENDER");
 if(p?.type==="whatsapp.inbound_message.received"&&v?.wabaId===env("YCLOUD_PILOT_WABA")&&/^\+[1-9]\d{7,14}$/.test(env("YCLOUD_PILOT_NUMBER"))&&v?.to===env("YCLOUD_PILOT_NUMBER")&&/^\+[1-9]\d{7,14}$/.test(from)&&v?.from===from&&!v?.groupId&&v?.type==="text"&&v?.text?.body==="GESTLOK PRUEBA 001"){console.info("YCLOUD_PILOT_TEST_RECEIVED");}
 return reply(204);
});