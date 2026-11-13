import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/stock/gestlok-cami-foto-real.js','utf8');
const mod=await import('data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64'));

function sample(w=12,h=8){
 const rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const p=4*(y*w+x);
  let r=(x%2?26:16),g=r,b=r; // tejido negro real, con textura y relieve
  if(y>=2&&y<=5&&x>=2&&x<=7){r=g=b=176;} // caja real iluminada a medias
  if(y>=2&&y<=5&&x>=8&&x<=10){r=144;g=85;b=167;} // tapa violeta
  rgba[p]=r;rgba[p+1]=g;rgba[p+2]=b;rgba[p+3]=255;
 }
 return rgba;
}
test('BELISA: conserva el negro tejido, su textura y la geometría original',()=>{
 const w=12,h=8,original=sample(w,h),edited=mod.mejorarLuzRealRGBA(original,w,h);
 assert.equal(edited.length,original.length);
 // Nunca se vuelve blanco el negro ni se recorta o rellena el fondo.
 assert.ok(edited[0]<35);
 assert.ok(edited[4]<40);
 assert.ok(edited[4]-edited[0]>5,'la textura alternada permanece visible');
 assert.deepEqual([...edited.filter((_,i)=>i%4===3)],[...original.filter((_,i)=>i%4===3)]);
 const q=4*(3*w+4);
 assert.ok(edited[q]>original[q]+10,'la caja recibe más luz');
 const k=4*(3*w+9);
 assert.ok(edited[k]>original[k]&&edited[k+1]>original[k+1],'la tapa recibe iluminación');
 assert.ok(Math.abs(edited[k]/edited[k+2]-original[k]/original[k+2])<.06,'se respeta el matiz violeta');
});
test('BELISA: protege blancos, negros, bytes del original y tamaños incompatibles',()=>{
 const image=new Uint8ClampedArray([0,0,0,255,250,250,250,255,120,120,120,128]);
 const copy=Uint8ClampedArray.from(image);
 const result=mod.mejorarLuzRealRGBA(image,3,1);
 assert.deepEqual(image,copy,'el original permanece intacto');
 assert.deepEqual([...result.slice(0,4)],[0,0,0,255],'negro puro se conserva');
 assert.ok(result[4]<=255&&result[4]>=245,'blancos sin quemar');
 assert.equal(result[11],128,'canal alfa preservado');
 assert.throws(()=>mod.mejorarLuzRealRGBA(image,4,1),/dimensiones/);
});
test('BELISA: editor local sin recorte, sustitución de fondo ni redes externas',()=>{
 assert.match(source,/export async function editarFotoReal/);
 assert.match(source,/mejorarLuzRealRGBA/);
 assert.match(source,/drawImage\(image,0,0,w,h\)/);
 assert.doesNotMatch(source,/fetch\(|removeBackground|recortarProducto|segment|@bg0|supabase|openai|gemini|https?:\/\//i);
});
