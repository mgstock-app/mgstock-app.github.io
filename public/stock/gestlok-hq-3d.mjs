import * as T from '../vendor/hq-three/three.module.js';

// Standalone visual simulation. Never sends tasks, changes permissions or calls an AI API.
const C={ink:0x19354b,navy:0x28485e,oak:0xd2b28c,cream:0xf1eee8,white:0xf7fafc,steel:0x798d98,teal:0x4e8890,green:0x527b59,glass:0xaed7e5};
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
const palette=[[-5.6,-3.6],[5.6,-3.6],[-5.6,0],[5.6,0],[-5.6,3.6],[5.6,3.6],[0,4.65]];
const seats=[[-1.85,-2.8],[1.85,-2.8],[-1.85,-1.55],[1.85,-1.55],[-.8,-.75],[.8,-.75],[0,-3.85]];
const mounted=new WeakMap();
const sec=(n)=>((n%60)+60)%60;
export function mount(host,people,opts={}){
 if(!host?.isConnected||mounted.has(host))return;
 let renderer;
 try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});}catch{return;}
 const scene=new T.Scene();
 scene.background=new T.Color(0xe4ecf0);
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
 renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:pan-y';
 renderer.domElement.setAttribute('aria-label','Oficina tridimensional interactiva de GESTLOK');
 const mats=new Map(),geos=new Map(),textures=[];
 const material=(color,extra={})=>{const k=JSON.stringify([color,extra]);if(!mats.has(k))mats.set(k,new T.MeshStandardMaterial({color,roughness:.72,metalness:.02,...extra}));return mats.get(k);};
 const geometry=(type,args)=>{const k=type+args.join(',');if(!geos.has(k))geos.set(k,new T[type](...args));return geos.get(k);};
 function mesh(parent,type,args,color,x,y,z,extra={}){
  const o=new T.Mesh(geometry(type,args),material(color,extra));o.position.set(x,y,z);o.castShadow=!extra.transparent;o.receiveShadow=true;parent.add(o);return o;
 }
 const box=(p,w,h,d,c,x,y,z,e)=>mesh(p,'BoxGeometry',[w,h,d],c,x,y,z,e);
 const sphere=(p,r,c,x,y,z,sx=1,sy=1,sz=1)=>{const o=mesh(p,'SphereGeometry',[r,12,9],c,x,y,z);o.scale.set(sx,sy,sz);return o;};
 const cyl=(p,r1,r2,h,c,x,y,z)=>mesh(p,'CylinderGeometry',[r1,r2,h,16],c,x,y,z);
 const group=(p,x=0,y=0,z=0)=>{const g=new T.Group();g.position.set(x,y,z);p.add(g);return g;};
 const world=group(scene);
 const hemi=new T.HemisphereLight(0xf3f8ff,0xa69a8d,2.3);scene.add(hemi);
 const key=new T.DirectionalLight(0xfff4dd,3.1);key.position.set(-7,14,9);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
 Object.assign(key.shadow.camera,{left:-11,right:11,top:10,bottom:-10,near:.5,far:35});key.shadow.bias=-.0004;key.shadow.normalBias=.025;scene.add(key);
 const fill=new T.DirectionalLight(0xd8eaff,1.1);fill.position.set(8,7,-9);scene.add(fill);
 // Raised architectural floor with warm boards, carpet zones and glass partitions.
 box(world,16.4,.28,12.9,0x94a5ad,0,-.18,0);
 box(world,16,.10,12.5,0xe4d9c8,0,-.035,0);
 for(let x=-7.5;x<8;x+=1)for(let z=-5.9;z<6;z+=2){
  const shade=[0xe8decd,0xe2d4bf,0xeaddc9,0xe0d4c3][Math.abs(Math.round(x*7+z*3))%4];
  box(world,.985,.014,1.98,shade,x,.023,z);
 }
 box(world,5.5,.025,4.65,0xd1dde0,0,.045,-2.25);
 box(world,4.2,.025,3.1,0xcdd9dc,0,.045,4.3);
 for(const x of [-5.6,5.6])for(const z of [-3.6,0,3.6])box(world,3.15,.028,2.8,0xd8e2e4,x,.046,z+.25);
 // Rear wall and tall glazed office windows, low enough to preserve the overview.
 box(world,16,.35,.18,C.navy,0,.18,-6.15);
 for(let x=-7.5;x<=7.5;x+=1.5){
  box(world,.07,2.5,.12,C.steel,x,1.28,-6.14);
  box(world,1.42,2.05,.055,C.glass,x+.7,1.38,-6.15,{transparent:true,opacity:.29,depthWrite:false});
 }
 box(world,16,.12,.18,C.navy,0,2.52,-6.15);
 function divider(x,z,len,rot=0){
  const g=group(world,x,0,z);g.rotation.y=rot;
  box(g,len,.07,.10,C.steel,0,.06,0);box(g,len,.06,.09,C.steel,0,1.43,0);
  box(g,len,1.33,.045,C.glass,0,.75,0,{transparent:true,opacity:.18,depthWrite:false});
  for(const xx of [-len/2,0,len/2])box(g,.055,1.47,.075,C.steel,xx,.73,0);
 }
 divider(-2.8,-2.3,4.3,Math.PI/2);divider(2.8,-2.3,4.3,Math.PI/2);
 divider(-2.1,4.45,3.2,Math.PI/2);divider(2.1,4.45,3.2,Math.PI/2);
 function plant(x,z,size=1){
  const g=group(world,x,0,z);g.scale.setScalar(size);
  cyl(g,.23,.18,.38,0x9ca9a8,0,.19,0);cyl(g,.19,.19,.025,0x655747,0,.39,0);
  for(let i=0;i<7;i++){const angle=i*2.399;const o=sphere(g,.18,i%2?0x6b9a6b:0x40784f,Math.cos(angle)*.18,.57+i%3*.12,Math.sin(angle)*.18,.65,1.8,.55);o.rotation.z=Math.sin(angle)*.6;o.rotation.x=Math.cos(angle)*.6;}
 }
 [[-7.45,-5.55],[7.45,-5.55],[-7.45,5.7],[7.45,5.7],[-2.4,5.55],[2.4,5.55],[-2.45,-4.95],[2.45,-4.95]].forEach(([x,z],i)=>plant(x,z,i%2?.82:1));
 function chair(p,x,z,rot=0){
  const g=group(p,x,0,z);g.rotation.y=rot;
  cyl(g,.055,.075,.34,C.steel,0,.2,0);
  for(let i=0;i<5;i++){const b=group(g,0,.07,0);b.rotation.y=i*Math.PI*2/5;box(b,.055,.05,.28,C.steel,0,0,.14);sphere(b,.055,C.ink,0,-.025,.27);}
  box(g,.49,.115,.45,C.navy,0,.48,0);box(g,.48,.53,.09,C.navy,0,.78,-.24);
  for(const x of [-.28,.28]){box(g,.045,.19,.05,C.steel,x,.58,0);box(g,.08,.055,.31,C.navy,x,.69,.02);}
  return g;
 }
 function screen(p,x,z,kind){
  const g=group(p,x,.81,z);
  box(g,.08,.19,.06,C.steel,0,.12,0);box(g,.38,.04,.24,C.steel,0,.02,0);
  box(g,.76,.46,.07,C.ink,0,.40,0);
  box(g,.69,.39,.01,0x23485e,0,.40,.041,{emissive:0x18374e,emissiveIntensity:.38});
  if(kind%3===0){for(let i=0;i<5;i++){box(g,.2+(i%3)*.08,.018,.011,i%2?0x81b6b9:0xf1c989,-.14+i%2*.06,.53-i*.063,.048);}}
  else if(kind%3===1){for(let i=0;i<5;i++)box(g,.062,.08+i*.042,.011,0x87bcb5,-.24+i*.115,.25+(.08+i*.042)/2,.048);}
  else{for(let i=0;i<3;i++){box(g,.46,.055,.011,0x7faebd,-.03,.51-i*.10,.048);box(g,.08,.055,.012,0xc5d8db,-.27,.51-i*.10,.05);}}
 }
 function workstation(x,z,i){
  const g=group(world,x,0,z);
  const w=i===6?2.55:2.30;
  box(g,w,.12,.95,C.oak,0,.77,0);
  for(const xx of [-w/2+.12,w/2-.12]){box(g,.085,.70,.80,C.steel,xx,.38,0);}
  box(g,.43,.56,.68,C.white,w/2-.38,.32,-.03);
  for(let j=0;j<3;j++){box(g,.30,.025,.015,C.steel,w/2-.38,.18+j*.17,.317);}
  screen(g,-.36,-.24,i);screen(g,.44,-.24,i+1);
  box(g,.49,.026,.18,0x304858,-.12,.847,.27);
  box(g,.12,.035,.18,C.ink,.30,.849,.27);
  box(g,.28,.025,.34,0xf8f7f1,-.80,.85,.18);
  box(g,.23,.01,.02,0xb3b9bc,-.80,.87,.18);
  cyl(g,.055,.055,.13,0xf1f4f4,.84,.89,.24);
  chair(g,0,.83,Math.PI);
  return g;
 }
 palette.forEach(([x,z],i)=>workstation(x,z,i));
 // Meeting room: solid oval table, seating and presentation board.
 const table=group(world,0,0,-2.15);
 const tableTop=cyl(table,1,1,.12,0xc3a17d,0,.77,0);tableTop.scale.set(1.58,1,1.05);
 cyl(table,.19,.28,.65,C.navy,0,.36,0);
 for(const [x,z] of seats){const ang=Math.atan2(-x,-2.15-z);chair(world,x,z,ang);}
 box(table,.54,.04,.30,C.ink,0,.85,0);
 for(const x of [-.6,.6]){box(table,.31,.018,.24,0xf8f7f2,x,.84,0);box(table,.26,.01,.02,0x9daeb5,x,.855,0);}
 const board=group(world,0,0,-5.25);
 box(board,3.35,1.47,.15,C.navy,0,1.69,0);box(board,3.13,1.25,.025,0xeef4f6,0,1.69,.09);
 for(let i=0;i<5;i++){box(board,.31,.20+i*.12,.02,i%2?0x82adb7:0x467d91,-1.13+i*.48,1.19+(.20+i*.12)/2,.11);}
 // A label is rendered from fixed names only, never from external task instructions.
 function label(name){
  const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');
  if(!ctx)throw Error('Canvas de etiquetas no disponible');
  ctx.fillStyle='#f8fbfc';ctx.beginPath();ctx.roundRect(3,3,250,58,14);ctx.fill();
  ctx.strokeStyle='#aebfc9';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#19354b';ctx.font='600 28px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,128,32,240);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);
  const m=new T.SpriteMaterial({map:tex,transparent:true,depthTest:false});mats.set('label:'+name,m);
  const sp=new T.Sprite(m);sp.scale.set(1.25,.31,1);sp.renderOrder=10;return sp;
 }
 function avatar(p,i){
  const g=group(world),pelvis=group(g,0,.79,0);
  const skin=p.skin||'#d8a687',hair=p.hair||'#342c29',shirt=p.shirt||'#34536f',fem=p.gender==='femenino';
  const trousers=fem?0x34434e:0x273844;
  const hips=sphere(pelvis,.18,trousers,0,.035,0,fem?1.16:1.05,.75,.78);
  const body=group(pelvis,0,.10,0);
  sphere(body,.255,shirt,0,.19,0,fem?.89:1.02,1.17,.57);
  box(body,.27,.028,.06,0xe5e9ea,0,.385,.125);
  if(i===6){box(body,.038,.23,.035,0xe8edf0,0,.21,.155);}
  const neck=cyl(body,.062,.071,.09,skin,0,.43,0);
  const head=group(body,0,.54,0);sphere(head,.139,skin,0,0,0,.88,1.16,.91);
  // Facial features and distinct adult hair silhouettes.
  for(const x of [-.045,.045])sphere(head,.014,0x29343a,x,.018,.115,.9,.8,.65);
  sphere(head,.023,skin,0,-.014,.124,.65,1,.85);
  box(head,.046,.009,.011,0x8e5d50,0,-.052,.118);
  for(const x of [-.122,.122])sphere(head,.026,skin,x,-.005,0,.55,1,.75);
  sphere(head,.143,hair,0,.073,-.026,.96,.78,.98);
  if(p.hairstyle==='long'||p.hairstyle==='bob'){
    const len=p.hairstyle==='long'?1.6:.94;
    for(const x of [-.111,.111])sphere(head,.095,hair,x,-.04,-.055,.56,len,.77);
    sphere(head,.134,hair,0,-.045,-.095,.91,len,.55);
  }else if(p.hairstyle==='bun'){sphere(head,.069,hair,0,.173,-.045);}
  else if(p.hairstyle==='ponytail'){const tail=sphere(head,.083,hair,0,-.095,-.14,.65,1.55,.72);tail.rotation.x=.27;}
  else if(p.hairstyle==='curly'){for(let j=0;j<8;j++){const a=j*Math.PI/4;sphere(head,.055,hair,Math.cos(a)*.094,.10+Math.sin(j*3)*.018,Math.sin(a)*.08-.012);}}
  else if(p.hairstyle==='beard'){sphere(head,.103,hair,0,-.065,.037,.77,.56,.65);}
  if(p.hairstyle==='bun'||p.hairstyle==='beard')for(const x of [-.045,.045]){const o=mesh(head,'TorusGeometry',[.035,.005,5,14],C.ink,x,.016,.12);o.scale.y=.8;}
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const shoulder=group(body,side*(fem?.205:.245),.30,0);
    sphere(shoulder,.082,shirt,0,0,0);
    const upper=cyl(shoulder,.066,.056,.235,shirt,0,-.116,0);
    const elbow=group(shoulder,0,-.235,0);
    cyl(elbow,.052,.041,.20,skin,0,-.10,0);sphere(elbow,.052,skin,0,-.21,0,.78,1,.72);
    arms.push({shoulder,elbow});
    const hip=group(pelvis,side*.105,0,0);
    cyl(hip,.09,.071,.34,trousers,0,-.17,0);
    const knee=group(hip,0,-.34,0);
    cyl(knee,.066,.047,.32,trousers,0,-.16,0);
    box(knee,.13,.09,.22,0x202f38,0,-.34,.046);
    legs.push({hip,knee});
  }
  const badge=label(p.name);g.add(badge);badge.position.set(0,1.78,0);
  g.userData.person=p.id;g.traverse(o=>{if(o.isMesh||o.isSprite)o.userData.person=p.id;});
  return {p,i,g,pelvis,body,head,arms,legs,badge,hips,neck};
 }
 const actors=people.map(avatar);
 function place(a,x,z,yaw){a.g.position.set(x,.062,z);a.g.rotation.y=yaw;}
 function pose(a,kind,t){
  const walk=kind==='walk',sit=kind==='type'||kind==='think'||kind==='research'||kind==='meeting'||kind==='consult';
  a.pelvis.position.y=sit?.57:walk?.80+Math.sin(t*13)*.025:.79;
  a.body.rotation.x=kind==='think'?-.10:kind==='type'?.13:kind==='meeting'?.04:0;
  a.head.rotation.y=kind==='research'?Math.sin(t*2)*.24:kind==='meeting'||kind==='consult'?Math.sin(t*1.3)*.25:Math.sin(t*.6)*.06;
  a.head.rotation.x=kind==='think'?-.12:kind==='type'?.12:kind==='research'?.05:0;
  a.badge.position.y=sit?1.57:1.78;
  a.legs.forEach(({hip,knee},j)=>{
   const wave=Math.sin(t*10+j*Math.PI);
   hip.rotation.x=walk?wave*.53:sit?-1.35:0;
   knee.rotation.x=walk?Math.max(0,-wave)*.55:sit?1.46:.04;
  });
  a.arms.forEach(({shoulder,elbow},j)=>{
   shoulder.rotation.z=(j===0?-.08:.08);
   if(walk){shoulder.rotation.x=-Math.sin(t*10+j*Math.PI)*.42;elbow.rotation.x=-.22;}
   else if(kind==='type'||kind==='research'){shoulder.rotation.x=-.9+Math.sin(t*8+j*2)*.07;elbow.rotation.x=-.52+Math.sin(t*12+j*2)*.11;}
   else if(kind==='think'){shoulder.rotation.x=j===0?-1.0:-.34;elbow.rotation.x=j===0?-1.62:-.65;}
   else if(kind==='meeting'||kind==='consult'){shoulder.rotation.x=-.48-Math.sin(t*2+j*1.8)*.30;elbow.rotation.x=-.7-Math.sin(t*3+j)*.3;shoulder.rotation.z=j===0?-.21:.21;}
   else{shoulder.rotation.x=0;elbow.rotation.x=-.12;}
  });
 }
 function pathAt(points,t){
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let remaining=clamp(t)*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const a=points[i],b=points[i+1],u=lengths[i]?clamp(remaining/lengths[i]):1;return [mix(a[0],b[0],u),mix(a[1],b[1],u),Math.atan2(b[0]-a[0],b[1]-a[1])];}remaining-=lengths[i];}
  return [points[0][0],points[0][1],0];
 }
 function animatePerson(a,t,still){
  const [dx,dz]=palette[a.i], desk=[dx,dz+.83], goal=seats[a.i];
  const working=a.p.working, privateView=opts.mode==='private';
  const local=sec(t+a.i*2.4), phase=sec(t+8);
  if(working||privateView||still||phase<13||phase>=47){
   place(a,desk[0],desk[1],Math.PI);
   const activity=working?'type':still?'type':local%17<8?'type':local%17<12?'think':'research';
   pose(a,activity,t);return;
  }
  const side=dx<0?-1:dx>0?1:0;
  const corridor=side*3.3;
  const points=[desk,[dx,dz+1.45],[corridor,dz+1.45],[corridor,goal[1]],[goal[0],goal[1]]];
  if(phase<22){place(a,...pathAt(points,(phase-13)/9));pose(a,'walk',t);}
  else if(phase<37){place(a,goal[0],goal[1],Math.atan2(-goal[0],-2.15-goal[1]));pose(a,phase<30?'meeting':'consult',t+a.i*.7);}
  else{place(a,...pathAt(points.slice().reverse(),(phase-37)/10));pose(a,'walk',t);}
 }
 const camera=new T.OrthographicCamera(-10,10,8,-8,.1,100);
 let zoom=1, paused=false, disposed=false, frame=0,lastDraw=0,resizeObserver;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const target=new T.Vector3();
 function setCamera(){
  const w=Math.max(1,host.clientWidth),h=Math.max(1,viewport.clientHeight);const aspect=w/h;
  const priv=opts.mode==='private',selected=Math.max(0,people.findIndex(p=>p.id===opts.selected));
  const base=priv?4.0:Math.max(7.8,10/aspect);
  camera.left=-base*aspect/zoom;camera.right=base*aspect/zoom;camera.top=base/zoom;camera.bottom=-base/zoom;
  if(priv){const [x,z]=palette[selected];target.set(x,.60,z+.2);camera.position.set(x+5,5.5,z+8);}
  else{target.set(0,.15,0);camera.position.set(13,18,21);}
  camera.lookAt(target);camera.updateProjectionMatrix();renderer.setSize(w,h,false);
 }
 const viewport=document.createElement('div');viewport.style.cssText='position:relative;width:100%;height:clamp(330px,66vw,680px);overflow:hidden;background:#e4ecf0';
 if(opts.mode==='private')viewport.style.height='clamp(280px,46vw,450px)';
 const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:7px;padding:9px;background:#f8fbfc;border-top:1px solid #d4e0e6;align-items:center;color:#19354b';
 const status=document.createElement('span');status.style.cssText='font-size:12px;flex:1;min-width:130px';status.textContent='Escena ilustrativa · oficina 3D';
 function button(text,action){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=text;b.addEventListener('click',action);toolbar.append(b);return b;}
 button('−',()=>{zoom=clamp(zoom-.15,.8,1.8);setCamera();});button('+',()=>{zoom=clamp(zoom+.15,.8,1.8);setCamera();});button('Restablecer',()=>{zoom=1;setCamera();});
 const pauseButton=button('Pausar',()=>{paused=!paused;pauseButton.textContent=paused?'Reanudar':'Pausar';});
 toolbar.append(status);viewport.append(renderer.domElement);host.append(viewport,toolbar);
 const ray=new T.Raycaster(),pointer=new T.Vector2();
 let start=null;
 renderer.domElement.addEventListener('pointerdown',ev=>{start=[ev.clientX,ev.clientY];});
 renderer.domElement.addEventListener('pointerup',ev=>{
  if(!start||Math.hypot(ev.clientX-start[0],ev.clientY-start[1])>10)return;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.set((ev.clientX-rect.left)/rect.width*2-1,-(ev.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);
  const hit=ray.intersectObjects(actors.map(a=>a.g),true).find(x=>x.object.userData.person);
  if(hit)opts.onSelect?.(hit.object.userData.person);
 });
 function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frame);resizeObserver?.disconnect();
  geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();
  mounted.delete(host);
 }
 mounted.set(host,{dispose});
 try{
  host.hidden=false;
  setCamera();
  if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>{if(host.isConnected)setCamera();});resizeObserver.observe(host);}
  let time=performance.now()/1000;let clock=performance.now();
  actors.forEach(a=>animatePerson(a,time,reduced.matches));
  renderer.render(scene,camera);
  host.dataset.hqRenderer='three';
  const stage=host.closest('[data-hq-scene-shell]');if(stage)stage.dataset.hq3dReady='true';
  function loop(now){
   if(!host.isConnected){dispose();return;}
   const dt=Math.min(.10,Math.max(0,(now-clock)/1000));clock=now;
   if(!paused&&!reduced.matches&&document.visibilityState!=='hidden')time+=dt;
   if(now-lastDraw>33&&document.visibilityState!=='hidden'){
    actors.forEach(a=>animatePerson(a,time,reduced.matches));
    const phase=sec(time+8);
    if(opts.mode!=='private')status.textContent='Escena ilustrativa · '+(phase>=13&&phase<22?'Camino a reunión':phase>=22&&phase<30?'Debate de proyectos':phase>=30&&phase<37?'Consulta con dirección':phase>=37&&phase<47?'Regreso a los puestos':'Trabajo individual');
    renderer.render(scene,camera);lastDraw=now;
   }
   frame=requestAnimationFrame(loop);
  }
  frame=requestAnimationFrame(loop);
 }catch(err){dispose();host.replaceChildren();host.hidden=true;delete host.dataset.hqRenderer;}
}
