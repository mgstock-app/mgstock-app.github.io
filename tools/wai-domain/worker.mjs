// GESTLOK WAI usa una sola dirección para todos: https://gestlok.com.ar/wai
// (app instalable, ingreso con usuario y contraseña). No hay subdominios por local.
// wai.gestlok.com.ar es el único subdominio de WAI y lleva a la app.
const APP='https://gestlok.com.ar/wai/';
const HOST='wai.gestlok.com.ar';
const slugOk=s=>typeof s==='string'&&s.length>=3&&s.length<=60&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
export async function handle(request){
 const url=new URL(request.url);
 if(url.hostname!==HOST||url.protocol!=='https:')return new Response('Dominio WAI inválido',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});
 const target=new URL(APP),local=url.searchParams.get('local');
 if(slugOk(local))target.searchParams.set('local',local);
 return Response.redirect(target.toString(),302);
}
const worker={fetch:request=>handle(request)};
export default worker;
