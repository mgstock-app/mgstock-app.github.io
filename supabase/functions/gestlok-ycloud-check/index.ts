// Diagnostic only. No message sends, no customer content, no database writes.
const env=(k:string)=>Deno.env.get(k)||"";
const reply=(data:Record<string,unknown>,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(env("SUPABASE_URL").replace(/\/$/,"")!=="https://irqeitzbfyerxcrogkyh.supabase.co")return reply({ok:false},503);
 const service=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!service||req.headers.get("Authorization")!=="Bearer "+service)return reply({ok:false},403);
 if(req.method!=="POST")return reply({ok:false},405);
 const key=env("YCLOUD_API_KEY");
 if(!key)return reply({ok:false,reason:"secret_missing"},503);
 try{
 const res=await fetch("https://api.ycloud.com/v2/webhookEndpoints?page=1&limit=1",{method:"GET",headers:{"X-API-Key":key,"Accept":"application/json"},redirect:"error",signal:AbortSignal.timeout(8000)});
 await res.body?.cancel();
 return reply({ok:res.ok,provider_status:res.status},res.ok?200:502);
 }catch{return reply({ok:false,reason:"provider_unreachable"},502);}
});