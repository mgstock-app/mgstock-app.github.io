import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/gestlok-cami-foto-estudio.js','utf8');
const m=await import('data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64'));

// Escena casera: caja blanca con etiqueta y letras, tapa negra, luz tenue y amarilla.
function scene(n){
 const r=new Float32Array(n*n),g=new Float32Array(n*n),b=new Float32Array(n*n),alpha=new Float32Array(n*n),text=new Uint8Array(n*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,u=x/n,v=y/n;let R=.45,G=.42,B=.38,a=0; // fondo: sábana gris
  if(u>.2&&u<.8&&v>.45&&v<.8){a=1;R=G=B=.95;
   if(v>.6&&v<.75&&u>.25&&u<.75){R=.55;G=.8;B=.65;}
   if(v>.65&&v<.7&&u>.3&&u<.7&&Math.floor(x/3)%3===0){R=G=B=.05;text[i]=1;}}
  if(u>.42&&u<.58&&v>.3&&v<=.45){a=1;R=G=B=.06;}
  const l=.6+.15*u; // luz casera que cae hacia un costado, amarillenta
  r[i]=R*l*1.06;g[i]=G*l*.96;b[i]=B*l*.76;alpha[i]=a;
 }
 return {img:{w:n,h:n,c:[r,g,b]},alpha,text};
}

test('Cartulina: blanco real (no #FFFFFF), con textura, más clara abajo y siempre igual con la misma semilla',()=>{
 const w=200,h=200,bg=m.makeBackdrop(w,h,{horizon:120,seed:3}),bg2=m.makeBackdrop(w,h,{horizon:120,seed:3});
 const mean=(y0,y1)=>{let s=0,k=0;for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){s+=bg.c[1][y*w+x];k++;}return s/k;};
 assert.ok(mean(0,40)>.82&&mean(0,40)<.92,'pared gris muy claro');
 assert.ok(mean(160,200)>mean(0,40)+.03,'el apoyo es más claro que la pared');
 let white=0;for(const v of bg.c[1])if(v>=.995)white++;
 assert.ok(white/(w*h)<.01,'no es blanco digital plano');
 assert.ok(mean(160,200)<.975);
 const hp=m.boxBlur(bg.c[1],w,h,2);let e=0;for(let i=0;i<w*h;i++)e+=(bg.c[1][i]-hp[i])**2;
 assert.ok(Math.sqrt(e/(w*h))>.002,'tiene grano de papel');
 assert.deepEqual(Array.from(bg.c[0].slice(0,50)),Array.from(bg2.c[0].slice(0,50)));
});

test('Luz correcta: blancos neutros y luminosos, sin quemar, y las letras siguen oscuras',()=>{
 const n=160,{img,alpha,text}=scene(n);
 const {img:out,report}=m.correctLight(img,alpha);
 const box=[];for(let y=Math.round(n*.48);y<n*.58;y++)for(let x=Math.round(n*.3);x<n*.7;x++)box.push(y*n+x);
 const avg=(p,ch)=>box.reduce((s,i)=>s+p.c[ch][i],0)/box.length;
 assert.ok(avg(img,2)<avg(img,0)-.1,'la foto casera era amarilla');
 assert.ok(Math.abs(avg(out,0)-avg(out,2))<.05,'caja blanca neutra: '+avg(out,0).toFixed(2)+'/'+avg(out,2).toFixed(2));
 assert.ok(avg(out,1)>.85&&avg(out,1)<.985,'caja luminosa sin quemar: '+avg(out,1).toFixed(3));
 let dark=0,k=0;for(let i=0;i<n*n;i++)if(text[i]){dark+=out.c[1][i];k++;}
 assert.ok(dark/k<.2,'letras oscuras: '+(dark/k).toFixed(2));
 assert.ok(report.exposure>1&&report.exposure<=1.75);
});

test('Sombra de apoyo: solo debajo y en el piso, nunca un contorno alrededor',()=>{
 const n=200,{alpha}=scene(n),sh=m.contactShadow(alpha,n,n,{horizon:110});
 let inside=0,above=0,under=0;
 for(let i=0;i<n*n;i++)if(alpha[i]>.5)inside=Math.max(inside,sh[i]);
 for(let y=0;y<Math.round(n*.4);y++)for(let x=0;x<n;x++)above=Math.max(above,sh[y*n+x]);
 for(let x=Math.round(n*.3);x<n*.7;x++)under=Math.max(under,sh[(Math.round(n*.8)+1)*n+x]);
 assert.equal(inside,0,'la sombra no cae sobre el producto');
 assert.ok(above<.01,'sin halo oscuro arriba ni a los costados');
 assert.ok(under>.15&&under<=.55,'sombra suave de apoyo: '+under.toFixed(2));
});

test('Foto final: forma y letras de la foto real, sin fondo de la sábana y sin recorte duro',()=>{
 const n=240,{img,alpha,text}=scene(n);
 const out=m.editarCartulinaPuro({frame:img,alpha,horizon:150,seed:5});
 const res=m.fromRGBA(out.rgba,n,n);
 // Afuera del producto ya no queda el gris de la sábana.
 let bgMean=0,k=0;for(let y=0;y<Math.round(n*.25);y++)for(let x=0;x<n;x++){bgMean+=res.c[1][y*n+x];k++;}
 assert.ok(bgMean/k>.84,'fondo de cartulina clara: '+(bgMean/k).toFixed(2));
 // Letras: el detalle coincide con la foto real.
 const yo=m.luminance(img),yr=m.luminance(res),so=m.boxBlur(yo,n,n,2),sr=m.boxBlur(yr,n,n,2);
 let num=0,da=0,db=0;for(let i=0;i<n*n;i++)if(alpha[i]>.9){const a=yo[i]-so[i],b=yr[i]-sr[i];num+=a*b;da+=a*a;db+=b*b;}
 assert.ok(num/Math.sqrt(da*db)>.85,'letras y bordes de la foto real');
 let dark=0,t=0;for(let i=0;i<n*n;i++)if(text[i]){dark+=res.c[1][i];t++;}
 assert.ok(dark/t<.25);
 assert.equal(out.width,n);
});

test('Encuadre: producto centrado y apoyado abajo, con aire arriba como una foto real',()=>{
 const p=m.placementCartulina({x:0,y:0,w:900,h:600});
 assert.ok(Math.abs(p.dx-(1200-p.dw)/2)<1e-9);
 assert.ok(Math.abs(p.dy+p.dh-1200*.82)<1e-6,'apoyado al 82 %');
 assert.ok(p.horizon<p.dy+p.dh&&p.horizon>p.dy,'la curva de la cartulina queda detrás del producto');
 assert.equal(m.placementCartulina({x:0,y:0,w:100,h:100}).s,2.4);
});

test('Sin IA generativa ni servicios externos en el motor',()=>{
 assert.doesNotMatch(source,/fetch\(|api\.|cloudflare|openai|gemini|https?:\/\//i);
 const recorte=readFileSync('public/stock/gestlok-cami-recorte.js','utf8');
 assert.match(recorte,/@bg0\/browser@0\.1\.1/);
 assert.match(recorte,/quality:'quality'/);
 assert.doesNotMatch(recorte,/upload\(|storage\.from|api\.cloudflare/);
});
