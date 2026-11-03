/* EAN-13 SVG labels, generated locally; no external services. */
(function(root){
'use strict';
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function bits(code){
 const s=String(code||'');
 if(!/^\d{13}$/.test(s))throw Error('Se requiere un EAN-13 de 13 dígitos.');
 const sum=[...s.slice(0,12)].reduce((a,c,i)=>a+Number(c)*(i%2?3:1),0);
 if((10-sum%10)%10!==Number(s[12]))throw Error('Dígito verificador inválido.');
 const parity=PARITY[Number(s[0])];
 return '101'+[...s.slice(1,7)].map((c,i)=>(parity[i]==='L'?L:G)[Number(c)]).join('')+'01010'+[...s.slice(7)].map(c=>R[Number(c)]).join('')+'101';
}
function svg(code){
 const pattern=bits(code),barWidth=2;
 const bars=[...pattern].map((v,i)=>v==='1'?'<rect x="'+(i+10)*barWidth+'" y="6" width="'+barWidth+'" height="105"/>':'').join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 140" role="img" aria-label="Código EAN-13 '+code+'"><rect width="230" height="140" fill="white"/><g fill="black">'+bars+'</g><text x="115" y="129" text-anchor="middle" font-size="14" font-family="monospace" fill="black">'+code+'</text></svg>';
}
const api=Object.freeze({bits,svg});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.GestLokPosEAN13=api;
})(typeof window!=='undefined'?window:globalThis);
