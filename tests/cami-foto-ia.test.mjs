import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/gestlok-cami-foto-ia.js','utf8');
const ia=await import('data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64'));

// Escena sintética: caja blanca con etiqueta verde y texto negro + frasco ámbar.
function scene(n,{textShift=0,garble=false}={}){
 const r=new Float32Array(n*n),g=new Float32Array(n*n),b=new Float32Array(n*n),alpha=new Float32Array(n*n);
 const textMask=new Uint8Array(n*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,u=x/n,v=y/n;
  let R=1,G=1,B=1,a=0;
  if(u>.12&&u<.55&&v>.45&&v<.85){a=1;R=G=B=.96;                 // caja blanca
   if(u>.15&&u<.52&&v>.62&&v<.78){R=.55;G=.78;B=.62;}            // etiqueta verde
  }
  if(u>.58&&u<.88&&v>.3&&v<.85){a=1;R=.86;G=.74;B=.38;}           // frasco ámbar
  if(u>.65&&u<.81&&v>.15&&v<=.3){a=1;R=G=B=.06;}                  // tapa negra
  // Texto: trazos verticales de 2 px en la etiqueta (la IA puede correrlos o borronearlos).
  const tx=x+textShift;
  if(u>.17&&u<.5&&v>.66&&v<.74&&(Math.floor(tx/3)%3===0)&&(!garble||((x*7+y*3)%11)>4)){R=G=B=.05;textMask[i]=1;}
  r[i]=R;g[i]=G;b[i]=B;alpha[i]=a;
 }
 return {img:{w:n,h:n,c:[r,g,b]},alpha,textMask};
}
// Luz casera: tenue, amarillenta y con caída lateral.
function homeLight(img){
 const n=img.w,c=img.c.map(p=>Float32Array.from(p));
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,l=.55+.25*(x/n);
  c[0][i]*=l*1.05;c[1][i]*=l*.95;c[2][i]*=l*.72;
 }
 return {w:n,h:n,c};
}
const highPass=(p,n)=>{const s=ia.boxBlur(p,n,n,2);return p.map((v,i)=>v-s[i]);};
function corr(a,b,mask){
 let sa=0,sb=0,k=0;for(let i=0;i<a.length;i++)if(mask[i]){sa+=a[i];sb+=b[i];k++;}
 const ma=sa/k,mb=sb/k;let num=0,da=0,db=0;
 for(let i=0;i<a.length;i++)if(mask[i]){const x=a[i]-ma,y=b[i]-mb;num+=x*y;da+=x*x;db+=y*y;}
 return num/Math.sqrt(da*db);
}

test('Alineación: recupera la escala y el desplazamiento que agregó la IA',()=>{
 const n=256,{img,alpha}=scene(n);
 const lum=ia.luminance(img);
 const moved=ia.warpPlane(lum,n,n,{s:1/1.04,dx:-5,dy:4},1); // la IA lo agrandó y lo movió
 const al=ia.alignToOriginal(lum,moved,alpha,n);
 assert.ok(al.score>.8,'puntaje alto: '+al.score);
 const back=ia.warpPlane(moved,n,n,al,1);
 let err=0,k=0;for(let i=0;i<back.length;i++)if(alpha[i]>.5){err+=Math.abs(back[i]-lum[i]);k++;}
 assert.ok(err/k<.06,'quedan superpuestos (error '+(err/k).toFixed(3)+')');
});

test('Fusión: la luz y el color vienen de la IA, los textos de la foto real',()=>{
 const n=384;
 const real=scene(n),aiScene=scene(n,{textShift:1,garble:true}); // la IA dibujó mal las letras
 const frame=homeLight(real.img);
 const ai=aiScene.img; // luz de estudio pareja y blancos neutros
 const fg=ia.estimateForeground(frame,real.alpha);
 const out=ia.fuseWithAI({frame,alpha:real.alpha,fg,ai,analysis:192});
 assert.equal(out.report.mode,'local');
 const res=ia.fromRGBA(out.rgba,n,n);
 // Caja blanca (zona lisa): pasa de gris amarillento a blanco neutro como la IA.
 const box=[];for(let y=Math.round(n*.5);y<n*.58;y++)for(let x=Math.round(n*.2);x<n*.45;x++)box.push(y*n+x);
 const mean=(img,ch)=>box.reduce((s,i)=>s+img.c[ch][i],0)/box.length;
 assert.ok(mean(frame,2)<.6,'la foto casera era oscura y amarilla');
 assert.ok(mean(res,0)>.9&&mean(res,2)>.88,'caja iluminada: '+mean(res,0).toFixed(2)+','+mean(res,2).toFixed(2));
 assert.ok(Math.abs(mean(res,0)-mean(res,2))<.06,'blancos neutros, sin tono amarillo');
 // Texto: el detalle del resultado coincide con la foto real, no con las letras de la IA.
 const label=new Uint8Array(n*n);
 for(let y=Math.round(n*.66);y<n*.74;y++)for(let x=Math.round(n*.17);x<n*.5;x++)label[y*n+x]=1;
 const hr=highPass(ia.luminance(res),n),ho=highPass(ia.luminance(frame),n),ha=highPass(ia.luminance(ai),n);
 const cReal=corr(hr,ho,label),cAI=corr(hr,ha,label);
 assert.ok(cReal>.9,'letras de la foto real: '+cReal.toFixed(3));
 assert.ok(cReal>cAI+.2,'no copia letras de la IA ('+cAI.toFixed(3)+')');
 // Contraste del texto conservado (las letras negras siguen negras).
 let dark=0,k=0;for(let i=0;i<label.length;i++)if(real.textMask[i]){dark+=res.c[1][i];k++;}
 assert.ok(dark/k<.3,'letras siguen oscuras: '+(dark/k).toFixed(2));
 assert.ok(out.report.fidelity>.9,'fidelidad de formas: '+out.report.fidelity);
});

test('Fondo blanco puro #FFFFFF y sin sombras fuera del producto',()=>{
 const n=200,{img,alpha}=scene(n);
 // La IA devolvió una sombra gris debajo: no debe aparecer.
 const ai={w:n,h:n,c:img.c.map(p=>{const o=Float32Array.from(p);for(let y=Math.round(n*.86);y<n*.95;y++)for(let x=0;x<n;x++)o[y*n+x]=.7;return o;})};
 const out=ia.fuseWithAI({frame:homeLight(img),alpha,ai,analysis:128});
 for(let i=0;i<n*n;i++)if(alpha[i]===0){
  assert.equal(out.rgba[i*4],255);assert.equal(out.rgba[i*4+1],255);assert.equal(out.rgba[i*4+2],255);
 }
});

test('Bordes: quita el color de la mesa pegado en el contorno suave',()=>{
 const n=120,r=new Float32Array(n*n),g=new Float32Array(n*n),b=new Float32Array(n*n),alpha=new Float32Array(n*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,a=Math.max(0,Math.min(1,(60-x)/6+.5)); // borde suave de 6 px
  alpha[i]=a;r[i]=a*.85+(1-a)*.2;g[i]=a*.1+(1-a)*.6;b[i]=a*.1+(1-a)*.2; // rojo sobre mesa verde
 }
 const fg=ia.estimateForeground({w:n,h:n,c:[r,g,b]},alpha);
 const i=60*n+60;// alpha≈0.5
 assert.ok(alpha[i]>.3&&alpha[i]<.7);
 assert.ok(fg.c[0][i]>.7&&fg.c[1][i]<.25,'color real del producto en el borde: '+fg.c[0][i].toFixed(2)+','+fg.c[1][i].toFixed(2));
});

test('Si la IA cambia el encuadre, solo se usa exposición global (nunca formas de la IA)',()=>{
 const n=192,{img,alpha}=scene(n);
 const other={w:n,h:n,c:img.c.map(p=>{const o=new Float32Array(n*n).fill(1);for(let y=20;y<80;y++)for(let x=120;x<180;x++)o[y*n+x]=p[(y+90)*n+x-100]||.5;return o;})};
 const out=ia.fuseWithAI({frame:homeLight(img),alpha,ai:other,analysis:128});
 assert.equal(out.report.mode,'global');
 assert.ok(out.report.fidelity>.9,'formas de la foto real: '+out.report.fidelity);
});

test('Encuadre de catálogo: producto centrado en 1200×1200 sin ampliar de más',()=>{
 const p=ia.placement({x:0,y:0,w:600,h:900});
 assert.ok(Math.abs(p.dx-(1200-p.dw)/2)<1e-9&&Math.abs(p.dy-(1200-p.dh)/2)<1e-9);
 assert.ok(p.dw<=1040+1e-9&&p.dh<=1000+1e-9);
 assert.equal(ia.placement({x:0,y:0,w:100,h:100}).s,2.4);
 assert.equal(ia.IA_ENTRADA<512,true,'Workers AI exige referencias menores a 512 px');
 assert.match(ia.IA_PROMPT,/Pure white seamless studio background/);
 assert.match(ia.IA_PROMPT,/Do not add, remove, rewrite or move anything/);
});

test('El módulo no tiene claves ni llama directo a proveedores',()=>{
 assert.doesNotMatch(source,/api\.cloudflare\.com|Bearer |apiKey|api_token|OPENAI|gemini/i);
 assert.match(source,/export async function editarConIA/);
 assert.match(source,/export async function editarSinIA/);
});

test('Vidrio: el fondo de la habitación visto a través del frasco se limpia hacia la IA',()=>{
 const n=256,{img,alpha}=scene(n),frame=homeLight(img);
 const glass=[];
 for(let y=Math.round(n*.32);y<n*.5;y++)for(let x=Math.round(n*.6);x<n*.86;x++){
  const i=y*n+x;glass.push(i);
  // Mancha suave de la pared (sin letras) que se ve a través del vidrio en la foto casera.
  const t=.18+.12*Math.sin(x/9)*Math.cos(y/11);
  for(let ch=0;ch<3;ch++)frame.c[ch][i]=t;
 }
 const ai={w:n,h:n,c:img.c.map(p=>{const o=Float32Array.from(p);for(const i of glass)o[i]=.93;return o;})};
 const out=ia.fuseWithAI({frame,alpha,ai,analysis:128});
 const res=ia.fromRGBA(out.rgba,n,n);
 const inner=glass.filter(i=>{const x=i%n,y=Math.floor(i/n);return x>n*.64&&x<n*.82&&y>n*.35&&y<n*.47;});
 const m=inner.reduce((s,i)=>s+res.c[1][i],0)/inner.length;
 const sd=Math.sqrt(inner.reduce((s,i)=>s+(res.c[1][i]-m)**2,0)/inner.length);
 assert.ok(m>.7,'vidrio luminoso como en la IA: '+m.toFixed(2));
 assert.ok(sd<.08,'sin manchas de la pared: '+sd.toFixed(3));
});
