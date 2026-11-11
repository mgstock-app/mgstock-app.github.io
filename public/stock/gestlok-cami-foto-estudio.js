/* GESTLOK · Mis Productos (ZAYRO) · Foto de catálogo «cartulina blanca».
 *
 * Edición fotográfica local, gratis y sin IA generativa: el resultado debe parecer
 * una foto real sacada sobre cartulina blanca con buena luz, no una imagen de IA.
 * 1. BiRefNet (en el teléfono) separa el producto: solo se usa la máscara.
 * 2. Luz correcta sobre la foto real: balance de blancos con las zonas blancas del
 *    producto, luz pareja (suaviza manchas de sol y sombras), exposición y una curva
 *    suave que no quema los blancos. Las letras y formas son siempre las de la foto.
 * 3. Fondo de cartulina: blanco cálido-neutro con degradé (pared → apoyo), curva
 *    suave donde se dobla la cartulina, textura fina de papel y viñeta leve.
 * 4. Sombra de apoyo suave debajo del producto (sin sombras recortadas alrededor),
 *    bordes integrados con la luz del fondo y el mismo grano en toda la foto.
 * Las funciones de cálculo son puras (sin DOM) para probarlas en Node.
 */
export const LIENZO=1200;
const clamp01=v=>v<0?0:v>1?1:v;
const smooth=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
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
// Color real del producto en el borde (quita el tono de la sábana o la mesa pegado al contorno).
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

// Terminación: menos grano en zonas lisas y nitidez solo en letras y aristas.
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
export function alphaBox(alpha,w,h,threshold=.06){
 let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(alpha[y*w+x]<threshold)continue;count++;
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
 }
 if(maxX<minX||maxY<minY||count<64)return null;
 return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,coverage:count/(w*h)};
}

/* ---------- Azar con semilla: misma foto → mismo resultado ---------- */
function rng(seed){
 let a=seed>>>0;
 return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
export function noisePlane(n,seed){
 const r=rng(seed),o=new Float32Array(n);
 for(let i=0;i<n;i+=2){
  const u=Math.max(1e-7,r()),v=r(),m=Math.sqrt(-2*Math.log(u));
  o[i]=m*Math.cos(2*Math.PI*v);if(i+1<n)o[i+1]=m*Math.sin(2*Math.PI*v);
 }
 return o;
}
function normalizeStd(p,target){
 let s=0,q=0;for(let i=0;i<p.length;i++){s+=p[i];q+=p[i]*p[i];}
 const m=s/p.length,sd=Math.sqrt(Math.max(1e-12,q/p.length-m*m));
 for(let i=0;i<p.length;i++)p[i]=(p[i]-m)*target/sd;
 return p;
}
function weightedPercentile(values,weights,p){
 const bins=1024,hist=new Float64Array(bins);let total=0;
 for(let i=0;i<values.length;i++){
  const w=weights[i];if(w<=0)continue;
  const b=Math.min(bins-1,Math.max(0,Math.floor(values[i]*bins)));hist[b]+=w;total+=w;
 }
 if(total<=0)return 0;
 let acc=0;for(let b=0;b<bins;b++){acc+=hist[b];if(acc>=total*p)return (b+.5)/bins;}
 return 1;
}

/* ---------- 1. Luz correcta (sobre la foto real) ---------- */
export function correctLight(img,alpha,opts={}){
 const {w,h}=img,N=w*h,c=img.c.map(p=>Float32Array.from(p)),[R,G,B]=c;
 const Y=new Float32Array(N),wt=new Float32Array(N);
 for(let i=0;i<N;i++){Y[i]=.2126*R[i]+.7152*G[i]+.0722*B[i];wt[i]=alpha[i]>.9?1:0;}
 // Balance de blancos: las partes blancas o grises del producto (caja, tapa, etiqueta).
 const bright=weightedPercentile(Y,wt,.7);
 let sr=0,sg=0,sb=0,k=0,area=0;
 for(let i=0;i<N;i++){
  if(!wt[i])continue;area++;
  const mx=Math.max(R[i],G[i],B[i]),mn=Math.min(R[i],G[i],B[i]);
  // Blancos teñidos por la luz (amarilla o azulada) también cuentan; colores fuertes no.
  if(Y[i]>=bright&&mx<.985&&(mx-mn)/(mx+1e-4)<.34){sr+=R[i];sg+=G[i];sb+=B[i];k++;}
 }
 let strength=.9;
 if(k<Math.max(50,area*.01)){ // sin zonas blancas: mundo gris, más suave
  sr=sg=sb=0;k=0;strength=.4;
  for(let i=0;i<N;i++)if(wt[i]){sr+=R[i];sg+=G[i];sb+=B[i];k++;}
 }
 let gains=[1,1,1];
 if(k){
  const m=[sr/k,sg/k,sb/k],l=.2126*m[0]+.7152*m[1]+.0722*m[2];
  gains=m.map(v=>1+strength*(l/Math.max(1e-4,v)-1)).map(g=>Math.max(.75,Math.min(1.35,g)));
  const norm=.2126*gains[0]+.7152*gains[1]+.0722*gains[2];gains=gains.map(g=>g/norm);
 }
 for(let i=0;i<N;i++){R[i]*=gains[0];G[i]*=gains[1];B[i]*=gains[2];Y[i]=.2126*R[i]+.7152*G[i]+.0722*B[i];}
 // Luz pareja: suaviza manchas de sol y sombras grandes, sin tocar el dibujo.
 const r=Math.max(4,Math.round(Math.max(w,h)*(opts.radius??.05))),eq=opts.equalize??.38;
 const ya=new Float32Array(N);for(let i=0;i<N;i++)ya[i]=Y[i]*alpha[i];
 const by=boxBlur(boxBlur(ya,w,h,r),w,h,r),ba=boxBlur(boxBlur(alpha,w,h,r),w,h,r);
 let sum=0,cnt=0;for(let i=0;i<N;i++)if(wt[i]){sum+=Y[i];cnt++;}
 const mean=cnt?sum/cnt:.5;
 for(let i=0;i<N;i++){
  if(alpha[i]<=0)continue;
  const base=by[i]/(ba[i]+1e-4);
  let g=Math.pow((mean+.03)/(base+.03),eq);
  if(g<.8)g=.8;if(g>1.45)g=1.45;
  R[i]*=g;G[i]*=g;B[i]*=g;Y[i]*=g;
 }
 // Exposición: los blancos del producto quedan blancos, no grises ni quemados.
 const p96=weightedPercentile(Y.map(v=>clamp01(v)),wt,.96);
 const exposure=Math.max(.85,Math.min(1.75,(opts.white??.93)/Math.max(.05,p96)));
 const knee=.86,room=.125;
 const tone=v=>{
  v*=exposure;
  v+=.22*v*(1-v)*(1-v);                 // levanta sombras con suavidad
  if(v>knee)v=knee+room*(1-Math.exp(-(v-knee)/room)); // blancos sin quemar
  return v<0?0:v>1?1:v;
 };
 for(let i=0;i<N;i++){
  if(alpha[i]<=0)continue;
  let r1=tone(R[i]),g1=tone(G[i]),b1=tone(B[i]);
  const y1=.2126*r1+.7152*g1+.0722*b1,sat=opts.saturation??1.06; // color apenas más vivo
  r1=y1+(r1-y1)*sat;g1=y1+(g1-y1)*sat;b1=y1+(b1-y1)*sat;
  R[i]=clamp01(r1);G[i]=clamp01(g1);B[i]=clamp01(b1);
 }
 return {img:{w,h,c},report:{gains:gains.map(g=>+g.toFixed(3)),exposure:+exposure.toFixed(3)}};
}

/* ---------- 2. Fondo de cartulina blanca ---------- */
// Blanco real de cartulina (no #FFFFFF): pared un poco más gris, apoyo más claro,
// curva suave donde se dobla, viñeta leve y textura fina de papel.
export function makeBackdrop(w,h,{horizon=Math.round(h*.62),seed=7}={}){
 const wall0=[.872,.879,.895],wall1=[.912,.918,.928],floor0=[.93,.934,.94],floor1=[.96,.962,.965];
 const band=Math.max(8,Math.round(h*.06));
 const fine=boxBlur(noisePlane(w*h,seed),w,h,1);normalizeStd(fine,.0065);
 const mottle=boxBlur(boxBlur(noisePlane(w*h,seed+1),w,h,Math.round(w*.03)),w,h,Math.round(w*.03));normalizeStd(mottle,.006);
 const c=[new Float32Array(w*h),new Float32Array(w*h),new Float32Array(w*h)];
 for(let y=0;y<h;y++){
  const tw=Math.min(1,y/Math.max(1,horizon)),tf=Math.max(0,(y-horizon)/Math.max(1,h-horizon));
  const t=smooth(y,horizon-band,horizon+band);
  for(let x=0;x<w;x++){
   const i=y*w+x,dx=(x/w-.5)*2,vig=1-.04*dx*dx-.02*Math.max(0,(horizon-y)/horizon);
   for(let ch=0;ch<3;ch++){
    const wall=wall0[ch]+(wall1[ch]-wall0[ch])*tw,floor=floor0[ch]+(floor1[ch]-floor0[ch])*tf;
    c[ch][i]=clamp01(((1-t)*wall+t*floor)*vig+fine[i]+mottle[i]);
   }
  }
 }
 return {w,h,c};
}

/* ---------- 3. Sombra de apoyo (solo en el piso, nunca un contorno recortado) ---------- */
export function contactShadow(alpha,w,h,{horizon=Math.round(h*.62)}={}){
 const base=new Int32Array(w).fill(-1);
 for(let x=0;x<w;x++)for(let y=h-1;y>=0;y--)if(alpha[y*w+x]>.5){base[x]=y;break;}
 const contact=new Float32Array(w*h),foot=new Float32Array(w*h);
 const d=Math.max(3,Math.round(h*.01)),ft=Math.max(4,Math.round(h*.025));
 for(let x=0;x<w;x++){
  const b=base[x];if(b<0)continue;
  for(let k=0;k<=d&&b+k<h;k++){const v=(1-k/d);contact[(b+k)*w+x]=v*v;}
  for(let k=0;k<ft&&b-k>=0;k++)foot[(b-k)*w+x]=1;
 }
 const r1=Math.max(2,Math.round(w*.004)),r2=Math.max(4,Math.round(w*.03));
 const cb=boxBlur(boxBlur(contact,w,h,r1),w,h,r1),fb=boxBlur(boxBlur(foot,w,h,r2),w,h,r2);
 const out=new Float32Array(w*h);
 for(let y=0;y<h;y++){
  const floor=smooth(y,horizon,horizon+Math.round(h*.05));
  for(let x=0;x<w;x++){const i=y*w+x;out[i]=Math.min(.55,.5*cb[i]+.3*fb[i]*floor)*(1-alpha[i]);}
 }
 return out;
}

/* ---------- 4. Composición natural ---------- */
export function composeCartulina(fg,alpha,bg,shadow,{seed=11}={}){
 const {w,h}=fg,N=w*h,out=new Uint8ClampedArray(N*4);
 const lit=bg.c.map(p=>{const o=new Float32Array(N);for(let i=0;i<N;i++)o[i]=p[i]*(1-shadow[i]);return o;});
 const soft=lit.map(p=>boxBlur(p,w,h,3)),inner=boxBlur(alpha,w,h,2);
 const grain=boxBlur(noisePlane(N,seed),w,h,1);normalizeStd(grain,.005); // mismo grano en todo
 for(let i=0,p=0;i<N;i++,p+=4){
  const a=alpha[i],edge=a>0?Math.min(1,Math.max(0,(1-inner[i])*2.2)):0;
  for(let ch=0;ch<3;ch++){
   let f=fg.c[ch][i];
   f+=(soft[ch][i]-f)*.16*edge;          // la luz del fondo envuelve apenas el borde
   const v=a*f+(1-a)*lit[ch][i]+grain[i];
   out[p+ch]=Math.round(clamp01(v)*255);
  }
  out[p+3]=255;
 }
 return out;
}

/* ---------- Encuadre ---------- */
// Producto centrado, apoyado al 82 % de la altura, con aire arriba como en una foto real.
export function placementCartulina(box,size=LIENZO){
 const s=Math.min(1000/box.w,860/box.h,2.4),dw=box.w*s,dh=box.h*s;
 const dx=(size-dw)/2,dy=Math.max(size*.06,size*.82-dh);
 const horizon=Math.round(Math.max(size*.38,Math.min(size*.76,dy+dh-dh*.32)));
 return {s,dx,dy,dw,dh,horizon};
}
// Cálculo completo sin DOM: frame (foto real encuadrada) + alpha → RGBA final.
export function editarCartulinaPuro({frame,alpha,horizon,seed=7}){
 const {w,h}=frame;
 const fg=estimateForeground(frame,alpha);
 const light=correctLight(fg,alpha);
 const a=cleanAlpha(alpha);
 const bg=makeBackdrop(w,h,{horizon,seed});
 const fine=polish(light.img,a,{sharpen:.32,denoise:.6});
 const sh=contactShadow(a,w,h,{horizon});
 return {rgba:composeCartulina(fine,a,bg,sh,{seed:seed+4}),width:w,height:h,report:{...light.report,horizon}};
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
function toBlob(c,q){return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('No se pudo exportar la foto.')),'image/jpeg',q));}

export async function editarFotoCartulina(original,{recortar,onProgress}={}){
 if(typeof recortar!=='function')throw Error('Falta el separador de producto.');
 onProgress?.('separando',0);
 const cut=await recortar(original,p=>onProgress?.('separando',Number(p?.progress)||0));
 const source=await decode(original),sd=dims(source);
 if(sd.w<1||sd.h<1)throw Error('La imagen no tiene un tamaño compatible.');
 const cw=cut.width,ch=cut.height;
 const alphaFull=alphaFromRGBA(cut.data,cw,ch);
 const box=alphaBox(alphaFull,cw,ch);
 if(!box)throw Error('No se encontró el producto en la foto. Probá con el producto más cerca y con luz.');
 if(box.coverage>.97)throw Error('No se pudo separar el producto del fondo. Probá con un fondo más liso.');
 onProgress?.('luz',0);
 const place=placementCartulina(box);
 // Toda la foto se dibuja con la misma escala: el fondo real alrededor ayuda a limpiar bordes.
 const frameC=canvas(LIENZO,LIENZO),fx=ctx2d(frameC);
 fx.fillStyle='#fff';fx.fillRect(0,0,LIENZO,LIENZO);
 const ox=place.dx-box.x*place.s,oy=place.dy-box.y*place.s;
 fx.drawImage(source,ox,oy,cw*place.s,ch*place.s);source.close?.();
 const maskSrc=canvas(cw,ch),mx=ctx2d(maskSrc),md=mx.createImageData(cw,ch);
 for(let i=0,p=0;i<alphaFull.length;i++,p+=4){const v=Math.round(alphaFull[i]*255);md.data[p]=md.data[p+1]=md.data[p+2]=v;md.data[p+3]=255;}
 mx.putImageData(md,0,0);
 const maskC=canvas(LIENZO,LIENZO),kx=ctx2d(maskC);
 kx.fillStyle='#000';kx.fillRect(0,0,LIENZO,LIENZO);
 kx.drawImage(maskSrc,ox,oy,cw*place.s,ch*place.s);
 const frame=fromRGBA(fx.getImageData(0,0,LIENZO,LIENZO).data,LIENZO,LIENZO);
 const alpha=alphaFromRGBA(kx.getImageData(0,0,LIENZO,LIENZO).data,LIENZO,LIENZO,0);
 onProgress?.('cartulina',0);
 const out=editarCartulinaPuro({frame,alpha,horizon:place.horizon,seed:7});
 const c=canvas(LIENZO,LIENZO);ctx2d(c).putImageData(new ImageData(out.rgba,LIENZO,LIENZO),0,0);
 let blob=await toBlob(c,.92);
 if(blob.size>3*1024*1024)blob=await toBlob(c,.85);
 if(blob.size>3*1024*1024)throw Error('La foto final supera 3 MB.');
 onProgress?.('listo',1);
 return {blob,report:out.report};
}
