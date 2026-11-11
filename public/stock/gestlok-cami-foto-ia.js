/* GESTLOK · Mis Productos (ZAYRO) · Edición fotográfica con IA.
 *
 * Cómo trabaja:
 * 1. En el teléfono, BiRefNet separa el producto (máscara suave, sin bordes duros).
 * 2. Una copia chica del producto viaja a la IA generativa gratuita (Cloudflare
 *    Workers AI · FLUX.2 klein, a través de la función de Supabase de GESTLOK),
 *    que la rehace como foto de catálogo: luz de estudio, blancos neutros, reflejos.
 * 3. GESTLOK NO pega los píxeles de la IA: calcula, zona por zona, cómo la IA
 *    cambió la luz y el color, y aplica ese cambio sobre la foto real en alta
 *    resolución. Así textos, etiquetas, tapas y formas salen siempre de la foto
 *    original, aunque la IA dibuje mal una letra.
 * 4. Composición en 1200×1200 con fondo #FFFFFF exacto, sin sombras.
 *
 * Las funciones de cálculo son puras (sin DOM) para poder probarlas en Node.
 */

export const IA_MODELO='@cf/black-forest-labs/flux-2-klein-4b';
export const IA_NOMBRE='FLUX.2 klein · Cloudflare Workers AI';
export const IA_ENTRADA=496;   // Workers AI exige imágenes de referencia menores a 512×512.
export const LIENZO=1200;
export const IA_PROMPT=[
 'Professional e-commerce catalog photograph of the exact same product shown in image 0.',
 'Pure white seamless studio background (#FFFFFF). No shadows, no floor reflection, no props.',
 'Soft, even, high-key studio lighting with large softboxes; bright and crisp; natural subtle',
 'highlights and reflections on glass and glossy surfaces; shadows on the product gently filled.',
 'Neutral white balance and true-to-life colors.',
 'Keep the product identical: same bottle, cap, box, liquid color, shape, size, position, angle,',
 'labels, logos and text. Do not add, remove, rewrite or move anything. Same framing, centered.'
].join(' ');

const clamp01=v=>v<0?0:v>1?1:v;
const smooth=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

/* ---------- Utilidades de imagen (planos Float32 en 0..1) ---------- */
export function fromRGBA(data,w,h){
 const n=w*h,r=new Float32Array(n),g=new Float32Array(n),b=new Float32Array(n);
 for(let i=0,p=0;i<n;i++,p+=4){r[i]=data[p]/255;g[i]=data[p+1]/255;b[i]=data[p+2]/255;}
 return {w,h,c:[r,g,b]};
}
export function alphaFromRGBA(data,w,h,channel=3){
 const a=new Float32Array(w*h);
 for(let i=0,p=channel;i<a.length;i++,p+=4)a[i]=data[p]/255;
 return a;
}
export function luminance(img){
 const [r,g,b]=img.c,y=new Float32Array(r.length);
 for(let i=0;i<y.length;i++)y[i]=.2126*r[i]+.7152*g[i]+.0722*b[i];
 return y;
}
export function boxBlur(src,w,h,radius){
 const r=Math.max(0,Math.round(radius));
 if(!r)return Float32Array.from(src);
 const tmp=new Float32Array(w*h),out=new Float32Array(w*h),cum=new Float64Array(Math.max(w,h)+1);
 for(let y=0;y<h;y++){
  const o=y*w;cum[0]=0;
  for(let x=0;x<w;x++)cum[x+1]=cum[x]+src[o+x];
  for(let x=0;x<w;x++){const a=x>r?x-r:0,b=x+r+1<w?x+r+1:w;tmp[o+x]=(cum[b]-cum[a])/(b-a);}
 }
 for(let x=0;x<w;x++){
  cum[0]=0;
  for(let y=0;y<h;y++)cum[y+1]=cum[y]+tmp[y*w+x];
  for(let y=0;y<h;y++){const a=y>r?y-r:0,b=y+r+1<h?y+r+1:h;out[y*w+x]=(cum[b]-cum[a])/(b-a);}
 }
 return out;
}
// Reducción por promedio de área (sin escalones) o ampliación bilineal.
export function resizePlane(src,sw,sh,dw,dh){
 const out=new Float32Array(dw*dh),fx=sw/dw,fy=sh/dh;
 if(fx>1.25||fy>1.25){
  for(let y=0;y<dh;y++){
   const y0=y*fy,y1=y0+fy,iy0=Math.floor(y0),iy1=Math.min(sh,Math.ceil(y1));
   for(let x=0;x<dw;x++){
    const x0=x*fx,x1=x0+fx,ix0=Math.floor(x0),ix1=Math.min(sw,Math.ceil(x1));
    let s=0,n=0;
    for(let yy=iy0;yy<iy1;yy++){
     const wy=Math.min(yy+1,y1)-Math.max(yy,y0);if(wy<=0)continue;
     for(let xx=ix0;xx<ix1;xx++){
      const wx=Math.min(xx+1,x1)-Math.max(xx,x0);if(wx<=0)continue;
      s+=src[yy*sw+xx]*wx*wy;n+=wx*wy;
     }
    }
    out[y*dw+x]=n?s/n:0;
   }
  }
  return out;
 }
 for(let y=0;y<dh;y++){
  let sy=(y+.5)*fy-.5;if(sy<0)sy=0;if(sy>sh-1)sy=sh-1;
  const y0=Math.floor(sy),y1=Math.min(sh-1,y0+1),ty=sy-y0;
  for(let x=0;x<dw;x++){
   let sx=(x+.5)*fx-.5;if(sx<0)sx=0;if(sx>sw-1)sx=sw-1;
   const x0=Math.floor(sx),x1=Math.min(sw-1,x0+1),tx=sx-x0;
   const a=src[y0*sw+x0],b=src[y0*sw+x1],c=src[y1*sw+x0],d=src[y1*sw+x1];
   out[y*dw+x]=(a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
  }
 }
 return out;
}
export function resizeImage(img,dw,dh){return {w:dw,h:dh,c:img.c.map(p=>resizePlane(p,img.w,img.h,dw,dh))};}
export function gradientMagnitude(y,w,h){
 const g=new Float32Array(w*h);
 for(let j=0;j<h;j++){
  const up=(j?j-1:0)*w,dn=(j<h-1?j+1:h-1)*w,o=j*w;
  for(let i=0;i<w;i++){
   const l=i?i-1:0,r=i<w-1?i+1:w-1;
   const gx=y[o+r]-y[o+l],gy=y[dn+i]-y[up+i];
   g[o+i]=Math.sqrt(gx*gx+gy*gy)*.5;
  }
 }
 return g;
}
// Transformación de alineación: destino → origen (escala alrededor del centro + desplazamiento).
function samplePlane(src,w,h,x,y,fill){
 if(x<-.5||y<-.5||x>w-.5||y>h-.5)return fill;
 if(x<0)x=0;if(y<0)y=0;if(x>w-1)x=w-1;if(y>h-1)y=h-1;
 const x0=Math.floor(x),y0=Math.floor(y),x1=x0+1<w?x0+1:x0,y1=y0+1<h?y0+1:y0,tx=x-x0,ty=y-y0;
 const a=src[y0*w+x0],b=src[y0*w+x1],c=src[y1*w+x0],d=src[y1*w+x1];
 return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}
export function warpPlane(src,w,h,t,fill=1){
 const out=new Float32Array(w*h),cx=(w-1)/2,cy=(h-1)/2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)
  out[y*w+x]=samplePlane(src,w,h,cx+(x-cx)*t.s+t.dx,cy+(y-cy)*t.s+t.dy,fill);
 return out;
}
function weightedNcc(a,b,wt){
 let sw=0,sa=0,sb=0;
 for(let i=0;i<a.length;i++){const w=wt[i];if(!w)continue;sw+=w;sa+=w*a[i];sb+=w*b[i];}
 if(sw<=1e-6)return 0;
 const ma=sa/sw,mb=sb/sw;let num=0,da=0,db=0;
 for(let i=0;i<a.length;i++){
  const w=wt[i];if(!w)continue;
  const x=a[i]-ma,y=b[i]-mb;num+=w*x*y;da+=w*x*x;db+=w*y*y;
 }
 return da>1e-12&&db>1e-12?num/Math.sqrt(da*db):0;
}

/* ---------- 1. Alinear la respuesta de la IA con la foto real ---------- */
// Busca escala y desplazamiento que mejor superponen los contornos (correlación de
// gradientes). Si la IA movió o rehízo el producto, el puntaje baja y no se usa en detalle.
export function alignToOriginal(origLum,aiLum,weight,n){
 const level=(m)=>{
  const o=gradientMagnitude(boxBlur(resizePlane(origLum,n,n,m,m),m,m,1),m,m);
  const a=gradientMagnitude(boxBlur(resizePlane(aiLum,n,n,m,m),m,m,1),m,m);
  const w=boxBlur(resizePlane(weight,n,n,m,m),m,m,Math.max(1,Math.round(m/32)));
  for(let i=0;i<w.length;i++)w[i]=w[i]>.02?Math.min(1,w[i]*1.5):0;
  return {o,a,w,m};
 };
 const score=(L,t)=>weightedNcc(L.o,warpPlane(L.a,L.m,L.m,t,0),L.w);
 const c=level(64);let best={s:1,dx:0,dy:0,score:score(c,{s:1,dx:0,dy:0})};
 for(let s=.9;s<=1.1001;s+=.02)for(let dx=-6;dx<=6;dx++)for(let dy=-6;dy<=6;dy++){
  const v=score(c,{s,dx,dy});
  if(v>best.score+1e-9)best={s,dx,dy,score:v};
 }
 const f=level(128);
 let fine={s:best.s,dx:best.dx*2,dy:best.dy*2};fine.score=score(f,fine);
 const base={...fine};
 for(let ds=-.015;ds<=.0151;ds+=.005)for(let dx=-2;dx<=2.001;dx+=.5)for(let dy=-2;dy<=2.001;dy+=.5){
  const t={s:base.s+ds,dx:base.dx+dx,dy:base.dy+dy},v=score(f,t);
  if(v>fine.score+1e-9)fine={...t,score:v};
 }
 const k=n/128;
 return {s:fine.s,dx:fine.dx*k,dy:fine.dy*k,score:fine.score};
}

/* ---------- 2. Transferir luz y color de la IA (ganancia local de luz) ---------- */
// La luz es multiplicativa: si la IA ilumina una zona 1,7×, la foto real se multiplica
// por 1,7 en esa zona. Una letra negra sobre etiqueta clara conserva su contraste
// proporcional y su forma exacta, porque el dibujo sigue siendo el de la foto.
// Solo donde la IA dejó lisa una zona que en la foto no tiene letras (por ejemplo,
// el fondo de la habitación visto a través del vidrio) se permite «limpiar» hacia la IA.
// `detail`: energía de bordes finos medida en la foto a resolución completa.
export function transferCoefficients(orig,ai,alpha,n,opts={}){
 const r=opts.radius??Math.max(3,Math.round(n*.028));
 const eps=opts.eps??.0025,gainMin=opts.gainMin??.45,gainMax=opts.gainMax??3.2,delta=.02;
 const N=n*n,w=new Float32Array(N);
 for(let i=0;i<N;i++)w[i]=alpha[i]*alpha[i]+1e-4;
 const W=boxBlur(w,n,n,r);
 let detail=opts.detail;
 if(!detail){
  const e=boxBlur(gradientMagnitude(luminance(orig),n,n),n,n,1);
  detail=new Float32Array(N);for(let i=0;i<N;i++)detail[i]=smooth(e[i],.045,.13);
 }
 const mean=(x)=>{const t=new Float32Array(N);for(let i=0;i<N;i++)t[i]=w[i]*x[i];const m=boxBlur(t,n,n,r);for(let i=0;i<N;i++)m[i]/=W[i];return m;};
 const r2=Math.max(1,Math.round(r/2)),support=boxBlur(W,n,n,r2);
 const outA=[],outB=[];
 for(let ch=0;ch<3;ch++){
  const I=orig.c[ch],P=ai.c[ch],II=new Float32Array(N),IP=new Float32Array(N),PP=new Float32Array(N);
  for(let i=0;i<N;i++){II[i]=I[i]*I[i];IP[i]=I[i]*P[i];PP[i]=P[i]*P[i];}
  const mI=mean(I),mP=mean(P),mII=mean(II),mIP=mean(IP),mPP=mean(PP);
  const a=new Float32Array(N),b=new Float32Array(N);
  for(let i=0;i<N;i++){
   const v=Math.max(0,mII[i]-mI[i]*mI[i]),vp=Math.max(0,mPP[i]-mP[i]*mP[i]),cov=mIP[i]-mI[i]*mP[i];
   let gain=(mP[i]+delta)/(mI[i]+delta);
   if(gain<gainMin)gain=gainMin;if(gain>gainMax)gain=gainMax;
   const flatter=1-smooth(Math.sqrt(vp/(v+1e-5)),.3,.75);
   const f=flatter*(1-detail[i]);
   const slope=Math.max(0,Math.min(gain,cov/(v+eps)));
   a[i]=(1-f)*gain+f*slope;
   b[i]=f*(mP[i]-slope*mI[i]);
  }
  const wa=new Float32Array(N),wb=new Float32Array(N);
  for(let i=0;i<N;i++){wa[i]=W[i]*a[i];wb[i]=W[i]*b[i];}
  const sa=boxBlur(wa,n,n,r2),sb=boxBlur(wb,n,n,r2);
  for(let i=0;i<N;i++){const d=support[i]>1e-6?support[i]:1;a[i]=sa[i]/d;b[i]=sb[i]/d;}
  outA.push(a);outB.push(b);
 }
 return {n,a:outA,b:outB,mode:'local'};
}
// Energía de bordes finos (letras) medida en alta resolución y llevada a la escala de análisis.
export function detailMap(img,n){
 const g=gradientMagnitude(luminance(img),img.w,img.h);
 const e=boxBlur(resizePlane(g,img.w,img.h,n,n),n,n,1),out=new Float32Array(n*n);
 for(let i=0;i<out.length;i++)out[i]=smooth(e[i],.018,.06);
 return out;
}
// Respaldo cuando la IA cambió el encuadre: solo exposición y balance de blancos globales.
export function globalCoefficients(orig,ai,alpha,n){
 const N=n*n,a=[],b=[];
 // Píxeles «de producto» en la imagen de la IA: los que no son fondo blanco.
 const aiMask=new Float32Array(N);
 for(let i=0;i<N;i++){const m=Math.min(ai.c[0][i],ai.c[1][i],ai.c[2][i]);aiMask[i]=m<.94?1:0;}
 for(let ch=0;ch<3;ch++){
  let so=0,soo=0,wo=0,sa=0,saa=0,wa=0;
  for(let i=0;i<N;i++){
   const o=orig.c[ch][i],p=ai.c[ch][i];
   so+=alpha[i]*o;soo+=alpha[i]*o*o;wo+=alpha[i];
   sa+=aiMask[i]*p;saa+=aiMask[i]*p*p;wa+=aiMask[i];
  }
  const mo=wo?so/wo:.5,mp=wa?sa/wa:mo;
  const vo=wo?Math.max(1e-5,soo/wo-mo*mo):1e-5,vp=wa?Math.max(1e-5,saa/wa-mp*mp):vo;
  const s=Math.max(.75,Math.min(1.45,Math.sqrt(vp/vo)));
  a.push(new Float32Array(N).fill(s));b.push(new Float32Array(N).fill(mp-s*mo));
 }
 return {n,a,b,mode:'global'};
}
export function applyCoefficients(img,coef){
 const {w,h}=img,c=[];
 for(let ch=0;ch<3;ch++){
  const a=resizePlane(coef.a[ch],coef.n,coef.n,w,h),b=resizePlane(coef.b[ch],coef.n,coef.n,w,h),src=img.c[ch];
  const out=new Float32Array(w*h);
  for(let i=0;i<out.length;i++)out[i]=clamp01(a[i]*src[i]+b[i]);
  c.push(out);
 }
 return {w,h,c};
}

/* ---------- 3. Bordes limpios: color real del producto en el contorno ---------- */
// Estimación rápida de color de primer plano (blur-fusion, Forte & Pitié 2021):
// quita el tono de la mesa o la pared que queda pegado en los bordes suaves.
export function estimateForeground(img,alpha){
 const {w,h}=img,N=w*h,inv=new Float32Array(N);
 for(let i=0;i<N;i++)inv[i]=1-alpha[i];
 const pass=(F,B,r)=>{
  const ba=boxBlur(alpha,w,h,r),nF=[],nB=[];
  for(let ch=0;ch<3;ch++){
   const fa=new Float32Array(N),b1=new Float32Array(N);
   for(let i=0;i<N;i++){fa[i]=F[ch][i]*alpha[i];b1[i]=B[ch][i]*inv[i];}
   const bfa=boxBlur(fa,w,h,r),bb1=boxBlur(b1,w,h,r),I=img.c[ch];
   const of=new Float32Array(N),ob=new Float32Array(N);
   for(let i=0;i<N;i++){
    const bf=bfa[i]/(ba[i]+1e-5),bb=bb1[i]/(1-ba[i]+1e-5),a=alpha[i];
    of[i]=clamp01(bf+a*(I[i]-a*bf-(1-a)*bb));ob[i]=bb;
   }
   nF.push(of);nB.push(ob);
  }
  return {F:nF,B:nB};
 };
 const big=Math.max(4,Math.round(Math.max(w,h)*.06)),small=Math.max(2,Math.round(Math.max(w,h)*.004));
 const first=pass(img.c,img.c,big);
 return {w,h,c:pass(first.F,first.B,small).F};
}

/* ---------- 4. Terminación: definición sin halos ---------- */
export function polish(img,alpha,opts={}){
 const {w,h}=img,N=w*h,[R,G,B]=img.c;
 const Y=new Float32Array(N),Cb=new Float32Array(N),Cr=new Float32Array(N);
 for(let i=0;i<N;i++){
  const y=.299*R[i]+.587*G[i]+.114*B[i];Y[i]=y;Cb[i]=B[i]-y;Cr[i]=R[i]-y;
 }
 // Ruido de color del celular: suavizar solo el color, nunca el dibujo.
 const cb=boxBlur(boxBlur(Cb,w,h,1),w,h,1),cr=boxBlur(boxBlur(Cr,w,h,1),w,h,1);
 const soft=boxBlur(boxBlur(Y,w,h,1),w,h,1),amount=opts.sharpen??.38,denoise=opts.denoise??.75;
 // Mapa de detalle real (letras, aristas): el grano del sensor no alcanza el umbral.
 const edges=boxBlur(gradientMagnitude(soft,w,h),w,h,2);
 const out=[new Float32Array(N),new Float32Array(N),new Float32Array(N)];
 for(let i=0;i<N;i++){
  let y=Y[i];
  const d=y-soft[i],detail=smooth(edges[i],.035,.09);
  // Zonas lisas: quitar grano. Letras y aristas: definir, sin halos en el contorno.
  y-=(1-detail)*denoise*d;
  if(alpha[i]>.97&&Math.abs(d)>.006)y+=detail*amount*d;
  const r=y+cr[i],b=y+cb[i],g=(y-.299*r-.114*b)/.587;
  out[0][i]=clamp01(r);out[1][i]=clamp01(g);out[2][i]=clamp01(b);
 }
 return {w,h,c:out};
}
export function cleanAlpha(alpha){
 const out=new Float32Array(alpha.length);
 for(let i=0;i<alpha.length;i++){const a=alpha[i];out[i]=a<.02?0:a>.985?1:(a-.02)/.965;}
 return out;
}
// Fondo #FFFFFF exacto: un píxel sin producto vale 255,255,255 (sin sombras ni grises).
export function composeOnWhite(img,alpha){
 const {w,h}=img,out=new Uint8ClampedArray(w*h*4);
 for(let i=0,p=0;i<w*h;i++,p+=4){
  const a=alpha[i];
  if(a<=0){out[p]=out[p+1]=out[p+2]=255;}
  else for(let ch=0;ch<3;ch++)out[p+ch]=Math.round((a*img.c[ch][i]+(1-a))*255);
  out[p+3]=255;
 }
 return out;
}
// Correlación de contornos entre la foto real y el resultado dentro del producto.
export function structureFidelity(origLum,outLum,alpha,w,h){
 const go=gradientMagnitude(origLum,w,h),gr=gradientMagnitude(outLum,w,h),wt=new Float32Array(w*h);
 for(let i=0;i<wt.length;i++)wt[i]=alpha[i]>.9?1:0;
 return weightedNcc(go,gr,wt);
}
export function compositeAnalysis(img,alpha){
 const c=img.c.map(p=>{const o=new Float32Array(p.length);for(let i=0;i<p.length;i++)o[i]=alpha[i]*p[i]+(1-alpha[i]);return o;});
 return {w:img.w,h:img.h,c};
}

/* ---------- Fusión completa (pura) ---------- */
// frame: foto real ya encuadrada (planos 0..1), alpha: máscara del producto,
// fg: color de primer plano estimado, ai: respuesta de la IA (cualquier tamaño).
export function fuseWithAI({frame,alpha,fg,ai,analysis=256,minScore=.32}){
 const n=analysis,{w,h}=frame;
 const alphaN=resizePlane(alpha,w,h,n,n);
 const origN=compositeAnalysis(resizeImage(fg||frame,n,n),alphaN);
 const aiN=resizeImage(ai,n,n);
 const align=alignToOriginal(luminance(origN),luminance(aiN),alphaN,n);
 let coef;
 if(align.score>=minScore){
  const warped={w:n,h:n,c:aiN.c.map(p=>warpPlane(p,n,n,align,1))};
  coef=transferCoefficients(origN,warped,alphaN,n,{detail:detailMap(fg||frame,n)});
 }else coef=globalCoefficients(origN,aiN,alphaN,n);
 const base=fg||estimateForeground(frame,alpha);
 const lit=polish(applyCoefficients(base,coef),alpha);
 const a=cleanAlpha(alpha);
 const m=512,aM=resizePlane(a,w,h,m,m);
 const fidelity=structureFidelity(resizePlane(luminance(frame),w,h,m,m),resizePlane(luminance(lit),w,h,m,m),aM,m,m);
 return {rgba:composeOnWhite(lit,a),width:w,height:h,
  report:{mode:coef.mode,alignScore:+align.score.toFixed(3),scale:+align.s.toFixed(3),fidelity:+fidelity.toFixed(3)}};
}
// Versión sin IA (solo si la persona la elige): misma composición, sin luz de estudio.
export function composeWithoutAI({frame,alpha,fg}){
 const lit=polish(fg||estimateForeground(frame,alpha),alpha,{sharpen:.3});
 return {rgba:composeOnWhite(lit,cleanAlpha(alpha)),width:frame.w,height:frame.h,report:{mode:'sin-ia'}};
}

/* ---------- Encuadre ---------- */
export function alphaBox(alpha,w,h,threshold=.06){
 let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(alpha[y*w+x]<threshold)continue;count++;
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
 }
 if(maxX<minX||maxY<minY||count<64)return null;
 return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,coverage:count/(w*h)};
}
// Producto centrado dentro de 1040×1000, sin ampliar más de 2,4× (evita fotos borrosas).
export function placement(box,size=LIENZO){
 const s=Math.min(1040/box.w,1000/box.h,2.4);
 const dw=box.w*s,dh=box.h*s;
 return {s,dx:(size-dw)/2,dy:(size-dh)/2,dw,dh};
}

/* ---------- Navegador ---------- */
async function decode(blob){
 if(typeof createImageBitmap==='function'){
  try{return await createImageBitmap(blob,{imageOrientation:'from-image'});}catch{/* sigue con Image */}
 }
 const url=URL.createObjectURL(blob);
 try{
  return await new Promise((resolve,reject)=>{
   const img=new Image();img.onload=()=>resolve(img);
   img.onerror=()=>reject(Error('No se pudo abrir la imagen.'));img.src=url;
  });
 }finally{URL.revokeObjectURL(url);}
}
const dims=img=>({w:img.naturalWidth||img.width,h:img.naturalHeight||img.height});
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function ctx2d(c){const x=c.getContext('2d',{willReadFrequently:true});if(!x)throw Error('El navegador no permite editar imágenes.');x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';return x;}
function toBlob(c,type='image/jpeg',q=.93){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('No se pudo exportar la foto.')),type,q));}
function rgbaToCanvas(rgba,w,h){const c=canvas(w,h),x=ctx2d(c);x.putImageData(new ImageData(rgba,w,h),0,0);return c;}
async function imageToPlanes(blob,size){
 const img=await decode(blob),d=dims(img),c=canvas(size||d.w,size||d.h),x=ctx2d(c);
 x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);
 img.close?.();
 return fromRGBA(x.getImageData(0,0,c.width,c.height).data,c.width,c.height);
}
async function exportJpeg(rgba,w,h){
 const c=rgbaToCanvas(rgba,w,h);
 let blob=await toBlob(c,'image/jpeg',.93);
 if(blob.size>3*1024*1024)blob=await toBlob(c,'image/jpeg',.85);
 if(blob.size>3*1024*1024)throw Error('La foto final supera 3 MB.');
 return blob;
}

// Prepara la foto: separa el producto (IA local) y lo encuadra en 1200×1200.
export async function prepararProducto(original,{recortar,onProgress}={}){
 if(typeof recortar!=='function')throw Error('Falta el separador de producto.');
 const cut=await recortar(original,p=>onProgress?.('separando',Number(p?.progress)||0));
 const source=await decode(original),sd=dims(source);
 const cw=cut.width,ch=cut.height;
 // Color siempre de la foto real; de la IA local solo se toma la máscara.
 const src=canvas(cw,ch),sx=ctx2d(src);sx.drawImage(source,0,0,cw,ch);source.close?.();
 const alphaFull=alphaFromRGBA(cut.data,cw,ch);
 const box=alphaBox(alphaFull,cw,ch);
 if(!box)throw Error('No se encontró el producto en la foto. Probá con el producto más cerca y con luz.');
 if(box.coverage>.97)throw Error('No se pudo separar el producto del fondo. Probá con un fondo más liso.');
 if(sd.w<1||sd.h<1)throw Error('La imagen no tiene un tamaño compatible.');
 const pad=Math.round(Math.max(box.w,box.h)*.015);
 const crop={x:Math.max(0,box.x-pad),y:Math.max(0,box.y-pad)};
 crop.w=Math.min(cw,box.x+box.w+pad)-crop.x;crop.h=Math.min(ch,box.y+box.h+pad)-crop.y;
 const place=placement(crop);
 const frameC=canvas(LIENZO,LIENZO),fx=ctx2d(frameC);
 fx.fillStyle='#fff';fx.fillRect(0,0,LIENZO,LIENZO);
 fx.drawImage(src,crop.x,crop.y,crop.w,crop.h,place.dx,place.dy,place.dw,place.dh);
 // Máscara a la misma escala (en un lienzo gris para no perder el borde suave).
 const maskSrc=canvas(cw,ch),mx=ctx2d(maskSrc),md=mx.createImageData(cw,ch);
 for(let i=0,p=0;i<alphaFull.length;i++,p+=4){const v=Math.round(alphaFull[i]*255);md.data[p]=md.data[p+1]=md.data[p+2]=v;md.data[p+3]=255;}
 mx.putImageData(md,0,0);
 const maskC=canvas(LIENZO,LIENZO),kx=ctx2d(maskC);
 kx.fillStyle='#000';kx.fillRect(0,0,LIENZO,LIENZO);
 kx.drawImage(maskSrc,crop.x,crop.y,crop.w,crop.h,place.dx,place.dy,place.dw,place.dh);
 const frame=fromRGBA(fx.getImageData(0,0,LIENZO,LIENZO).data,LIENZO,LIENZO);
 const alpha=alphaFromRGBA(kx.getImageData(0,0,LIENZO,LIENZO).data,LIENZO,LIENZO,0);
 onProgress?.('bordes',1);
 const fg=estimateForeground(frame,alpha);
 return {frame,alpha,fg};
}
// Copia chica para la IA: producto con bordes limpios sobre blanco, menor a 512×512.
export async function entradaParaIA(prep){
 const rgba=composeOnWhite(prep.fg,cleanAlpha(prep.alpha));
 const big=rgbaToCanvas(rgba,LIENZO,LIENZO),small=canvas(IA_ENTRADA,IA_ENTRADA);
 ctx2d(small).drawImage(big,0,0,IA_ENTRADA,IA_ENTRADA);
 return toBlob(small,'image/jpeg',.92);
}

// Edición completa con IA. `pedirIA(blob,{intento})` devuelve la imagen de la IA (Blob).
export async function editarConIA(original,{recortar,pedirIA,onProgress}={}){
 if(typeof pedirIA!=='function')throw Error('La edición con IA no está conectada.');
 const prep=await prepararProducto(original,{recortar,onProgress});
 const input=await entradaParaIA(prep);
 let best=null;
 for(let intento=1;intento<=2;intento++){
  onProgress?.('ia',intento);
  const aiBlob=await pedirIA(input,{intento});
  onProgress?.('fusion',intento);
  const ai=await imageToPlanes(aiBlob,512);
  const fused=fuseWithAI({frame:prep.frame,alpha:prep.alpha,fg:prep.fg,ai});
  fused.aiBlob=aiBlob;
  if(!best||fused.report.alignScore>best.report.alignScore)best=fused;
  // Con la IA bien alineada no hace falta un segundo pedido (cuida el cupo gratis).
  if(fused.report.mode==='local')break;
 }
 onProgress?.('final',1);
 const blob=await exportJpeg(best.rgba,best.width,best.height);
 return {blob,report:{...best.report,engine:IA_NOMBRE},aiBlob:best.aiBlob,inputBlob:input};
}
// Alternativa explícita y rotulada como «sin IA generativa».
export async function editarSinIA(original,{recortar,onProgress}={}){
 const prep=await prepararProducto(original,{recortar,onProgress});
 const out=composeWithoutAI(prep);
 return {blob:await exportJpeg(out.rgba,out.width,out.height),report:{...out.report,engine:'Versión básica (sin IA generativa)'}};
}
