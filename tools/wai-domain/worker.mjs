// Deploy ONLY after the production WAI portal is published and verified.
// Exact custom domains are provisioned separately on Cloudflare.
const ORIGIN='https://gestlok.com.ar';
const hostPattern=/^wai-([a-z0-9]+(?:-[a-z0-9]+)*)\.gestlok\.com\.ar$/;
const assetPath=/^\/(?:chat\/(?:wai\/|panel\/|carta-wai\/|config\.js$|motor\.js$|gestlok-monograma\.svg$|wallpaper-gestlok\.svg$)|vendor\/|icons\/|img\/)/;
export async function handle(request,fetcher=fetch){
 const url=new URL(request.url),slug=hostPattern.exec(url.hostname)?.[1];
 if(!slug||slug.length<3||slug.length>60||url.protocol!=='https:')return new Response('Dominio WAI inválido',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});
 if(url.pathname==='/'){
  url.pathname='/chat/wai/';
  if(url.searchParams.has('local')&&url.searchParams.get('local')!==slug)return new Response('Local inválido',{status:404});
  return Response.redirect(url.toString(),302);
 }
 if(url.pathname==='/chat/wai'){
  url.pathname='/chat/wai/';return Response.redirect(url.toString(),302);
 }
 if(url.pathname==='/chat/wai/'&&url.searchParams.has('local')&&url.searchParams.get('local')!==slug)return new Response('Local inválido',{status:404});
 if(!assetPath.test(url.pathname))return new Response('No disponible',{status:404});
 const target=new URL(url.pathname+url.search,ORIGIN);
 // Only static public assets. Never forward cookies, Authorization, or user data to GitHub Pages.
 const headers=new Headers();
 for(const name of ['accept','if-none-match','if-modified-since'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
 const upstream=await fetcher(target.toString(),{method:request.method,headers,redirect:'manual'});
 if(upstream.status>=300&&upstream.status<400&&upstream.status!==304)return new Response('Origen no disponible',{status:502});
 const out=new Headers(upstream.headers);
 out.delete('set-cookie');out.set('referrer-policy','same-origin');
 if(url.pathname==='/chat/wai/')out.set('cache-control','no-store');
 return new Response(upstream.body,{status:upstream.status,headers:out});
}
export default {fetch:request=>handle(request)};
