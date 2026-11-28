// GESTLOK WAI usa una sola dirección: https://gestlok.com.ar/wai (app instalable, ingreso con usuario y contraseña).
// Los subdominios viejos wai-<slug>.gestlok.com.ar solo redirigen al local dentro de la app única.
const APP='https://gestlok.com.ar/wai/';
const hostPattern=/^wai-([a-z0-9]+(?:-[a-z0-9]+)*)\.gestlok\.com\.ar$/;
export async function handle(request){
 const url=new URL(request.url),slug=hostPattern.exec(url.hostname)?.[1];
 if(!slug||slug.length<3||slug.length>60||url.protocol!=='https:')return new Response('Dominio WAI inválido',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});
 const target=new URL(APP);target.searchParams.set('local',slug);
 return Response.redirect(target.toString(),301);
}
const worker={fetch:request=>handle(request)};
export default worker;
