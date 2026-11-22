// Ignored Build Step para ambos proyectos Vercel conectados al MISMO repositorio.
// Vercel: exit 0 = saltear compilación; exit 1 = ejecutar compilación.
// Nunca usar como mecanismo de autorización: sólo optimiza la cuota de builds.
const branch=String(process.env.VERCEL_GIT_COMMIT_REF||'').trim();
const project=String(process.env.VERCEL_PROJECT_NAME||'').trim();
const prodUrl=String(process.env.VERCEL_PROJECT_PRODUCTION_URL||'').trim().toLowerCase();
const valid={prueba:'gestlok-prueba',testing:'gestlok-testing'};
if(!Object.hasOwn(valid,branch)){
 console.log('Vercel: no compilar rama distinta de prueba/testing:',branch||'(sin rama)');
 process.exit(0);
}
const target=valid[branch];
if(project && Object.values(valid).includes(project) && project!==target){
 console.log('Vercel: saltear '+branch+' en proyecto '+project+' (corresponde a '+target+')');
 process.exit(0);
}
if(!project && prodUrl && Object.values(valid).some(p=>prodUrl===p+'.vercel.app') && prodUrl!==target+'.vercel.app'){
 console.log('Vercel: saltear '+branch+' en URL de otro proyecto '+prodUrl);
 process.exit(0);
}
if(project && !Object.values(valid).includes(project)){
 console.warn('Vercel: proyecto no reconocido, no saltear por seguridad:',project);
}
console.log('Vercel: compilar sólo la versión '+branch+' para '+target);
process.exit(1);
