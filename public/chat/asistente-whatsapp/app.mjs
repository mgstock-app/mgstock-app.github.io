import {scenarios,draft} from './draft.mjs';
const input=document.querySelector('#incoming'),reply=document.querySelector('#reply'),status=document.querySelector('#status'),copy=document.querySelector('#copy');
const generate=()=>{const r=draft(input.value);reply.value=r.text;copy.disabled=!r.text;status.textContent=r.kind==='invalid'?'Ingresá una consulta de ejemplo.':r.kind==='humano'?'Requiere revisión del empleado.':'Revisá el texto antes de copiarlo.';};
for(const x of scenarios){const b=document.createElement('button');b.type='button';b.textContent=x.label;b.addEventListener('click',()=>{input.value=x.message;generate();});document.querySelector('#examples').append(b);}
document.querySelector('#generate').addEventListener('click',generate);
reply.addEventListener('input',()=>{copy.disabled=!reply.value.trim();});
copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(reply.value);status.textContent='Respuesta copiada. No se envió ningún mensaje.';}catch{reply.select();status.textContent='Seleccioná y copiá el texto manualmente.';}});
