/* GestLok · PDF de proveedores, un solo archivo, multipágina, sin imagen ni texto extra. */
(() => {
'use strict';
const fmt=n=>new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(Number(n)||0);
const win={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
const textBytes=str=>{
  const arr=[];
  for(const char of String(str)){const n=char.codePointAt(0);arr.push(n<=255?n:(win[char]||63));}
  return Uint8Array.from(arr);
};
const clean=v=>String(v??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const escapeText=value=>{
  let result='';
  for(const char of clean(value)){
    const cp=char.codePointAt(0),n=cp<=255?cp:(win[char]||63);
    if(n===40||n===41||n===92)result+='\\';
    result+=String.fromCharCode(n);
  }
  return result;
};
const wrap=(value,max=55)=>{
  const lines=[],words=clean(value).split(' ');let line='';
  for(let w of words){
    if(line&&(line+' '+w).length>max){lines.push(line);line='';}
    while(w.length>max){lines.push(w.slice(0,max));w=w.slice(max);}
    if(w)line+=(line?' ':'')+w;
  }
  if(line)lines.push(line);
  return lines.length?lines:[''];
};
const at=(x,y,size,value)=>'BT /F1 '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm ('+escapeText(value)+') Tj ET\n';
const pages=rows=>{
  const result=[];let page=[],height=0;
  for(const item of rows){
    const lines=wrap(item.nombre),lineH=Math.max(20,lines.length*13+5);
    if(page.length&&height+lineH>540){result.push(page);page=[];height=0;}
    page.push({nombre:item.nombre,unidad:item.unidad,pedir:item.pedir,lines,height:lineH});height+=lineH;
  }
  if(page.length)result.push(page);
  return result;
};
function crear({proveedor,local,productos,fecha}){
  const rows=Array.isArray(productos)?productos.filter(x=>Number(x.pedir)>0&&Number.isFinite(Number(x.pedir))):[];
  if(!rows.length)throw Error('El pedido guardado no tiene cantidades para exportar.');
  if(rows.length>2000)throw Error('Demasiados productos en el PDF.');
  const group=pages(rows),doc=[],pageIds=[],day=clean(fecha||new Date().toLocaleDateString('es-AR'));
  doc[1]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  doc[2]='';
  doc[3]='<< /Type /Catalog /Pages 2 0 R >>';
  for(let i=0;i<group.length;i++){
    const products=group[i];
    let stream='0.06 0.16 0.25 rg 0 770 595 72 re f\n1 1 1 rg\n'+
      at(40,803,22,'GESTLOK')+at(40,781,10,'PEDIDO A PROVEEDOR')+
      '0.08 0.22 0.31 rg\n'+at(40,744,14,'Proveedor: '+clean(proveedor).slice(0,75))+
      at(40,725,10,'Local: '+clean(local).slice(0,70)+'     Fecha: '+day)+
      '0.91 0.95 0.97 rg 38 681 519 29 re f\n0.08 0.22 0.31 rg\n'+
      at(45,691,10,'PRODUCTO')+at(440,691,10,'PEDIR');
    let y=666;
    for(let k=0;k<products.length;k++){
      const p=products[k];
      if(k%2===0)stream+='0.965 0.977 0.983 rg 38 '+(y-p.height+7)+' 519 '+p.height+' re f\n';
      stream+='0.10 0.22 0.32 rg\n';
      p.lines.forEach((line,n)=>stream+=at(45,y-n*13,9,line));
      stream+=at(442,y,9,fmt(p.pedir)+' '+clean(p.unidad||'unidad').slice(0,14));
      y-=p.height;
    }
    stream+='0.64 0.70 0.75 RG 38 72 m 557 72 l S\n0.33 0.44 0.54 rg\n'+
      at(40,55,9,'GestLok | '+rows.length+' productos | Pedido administrativo')+
      at(465,55,9,'Página '+(i+1)+' / '+group.length);
    const pageId=doc.length,contentId=pageId+1;
    doc[pageId]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 1 0 R >> >> /Contents '+contentId+' 0 R >>';
    doc[contentId]='<< /Length '+textBytes(stream).length+' >>\nstream\n'+stream+'endstream';
    pageIds.push(pageId);
  }
  doc[2]='<< /Type /Pages /Count '+pageIds.length+' /Kids ['+pageIds.map(n=>n+' 0 R').join(' ')+'] >>';
  const result=[textBytes('%PDF-1.4\n%GestLok\n')],offsets=[0];let offset=result[0].length;
  for(let i=1;i<doc.length;i++){
    const block=textBytes(i+' 0 obj\n'+doc[i]+'\nendobj\n');
    offsets[i]=offset;result.push(block);offset+=block.length;
  }
  const xrefAt=offset;
  let xref='xref\n0 '+doc.length+'\n0000000000 65535 f \n';
  for(let i=1;i<doc.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  xref+='trailer\n<< /Size '+doc.length+' /Root 3 0 R >>\nstartxref\n'+xrefAt+'\n%%EOF\n';
  result.push(textBytes(xref));
  const blob=new Blob(result,{type:'application/pdf'});
  const filename='pedido-'+clean(proveedor).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,40)+'-'+new Date().toISOString().slice(0,10)+'.pdf';
  return new File([blob],filename,{type:'application/pdf'});
}
window.GestLokProveedorPDF=Object.freeze({crear,pages,textBytes});
})();