/* GestLok · generador PDF de pedidos a proveedores.
 * Genera un PDF real sin canvas ni imágenes, compatible con descarga/Web Share.
 * No conecta a servicios externos y funciona con el catálogo guardado. */
(() => {
  'use strict';
  const special={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,
    '‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,
    '•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
  const latin=s=>Array.from(String(s??'').normalize('NFC')).map(ch=>{
    const n=ch.codePointAt(0);
    return String.fromCharCode(n<=255?n:(special[ch]??63));
  }).join('');
  const escape=s=>latin(s).replace(/[\\()]/g,'\\$&').replace(/[\r\n\t]/g,' ');
  const text=(x,y,s,size=10,bold=false)=>
    'BT /'+(bold?'F2':'F1')+' '+size+' Tf 1 0 0 1 '+x+' '+y+' Tm ('+escape(s)+') Tj ET\n';
  const rect=(x,y,w,h,r,g,b)=>
    [r,g,b].join(' ')+' rg '+x+' '+y+' '+w+' '+h+' re f\n';
  const qty=n=>String(Number(n)||0).replace('.',',');
  function documentContent({proveedor,local,fecha,rows,page,pages}){
    let out='0.09 0.18 0.27 rg\n';
    out+=rect(0,756,595,86,0.06,0.14,0.23);
    out+='1 1 1 rg\n'+text(38,799,'GESTLOK',21,true)+text(38,773,'PEDIDO A PROVEEDOR',11);
    out+='0.09 0.18 0.27 rg\n'+text(38,724,'Proveedor: '+String(proveedor).slice(0,70),14,true);
    out+=text(38,701,'Local: '+String(local).slice(0,60),10);
    out+=text(38,684,'Fecha: '+String(fecha).slice(0,38),10);
    out+=rect(36,645,523,25,0.90,0.94,0.96);
    out+='0.09 0.18 0.27 rg\n'+text(46,653,'PRODUCTO',10,true)+text(440,653,'PEDIR',10,true);
    const per=23;
    const offset=page*per;
    rows.slice(offset,offset+per).forEach((row,i)=>{
      const y=624-i*23;
      if(i%2===0)out+=rect(36,y-8,523,21,0.965,0.976,0.982);
      out+='0.09 0.18 0.27 rg\n';
      const name=String(row.nombre||'').replace(/\s+/g,' ').slice(0,64);
      out+=text(46,y,name,9);
      out+=text(440,y,qty(row.pedir)+' '+String(row.unidad||'unidad').slice(0,18),9,true);
    });
    out+='0.45 0.52 0.57 rg\n'+text(38,43,
      'Total de productos: '+rows.length+'          Página '+(page+1)+' de '+pages,9);
    out+=text(38,27,'Documento administrativo · Pedido generado desde GestLok',8);
    return out;
  }
  function createBlob({proveedor,local,fecha,rows}){
    if(!Array.isArray(rows)||!rows.length)throw new Error('El pedido no tiene productos.');
    if(rows.length>10000)throw new Error('Pedido demasiado grande para exportar.');
    const data={proveedor:String(proveedor||'Proveedor'),local:String(local||'Local'),
      fecha:String(fecha||new Date().toISOString().slice(0,10)),rows};
    const count=Math.ceil(rows.length/23);
    const objects=[null];
    const add=x=>(objects.push(x),objects.length-1);
    const pagesRef=add('');
    const fontRegular=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const refs=[];
    for(let p=0;p<count;p++){
      const stream=documentContent({...data,page:p,pages:count});
      const c=add('<< /Length '+stream.length+' >>\nstream\n'+stream+'endstream');
      const page=add('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 595 842] '+
        '/Resources << /Font << /F1 '+fontRegular+' 0 R /F2 '+fontBold+' 0 R >> >> /Contents '+c+' 0 R >>');
      refs.push(page);
    }
    objects[pagesRef]='<< /Type /Pages /Kids ['+refs.map(i=>i+' 0 R').join(' ')+'] /Count '+refs.length+' >>';
    const catalog=add('<< /Type /Catalog /Pages '+pagesRef+' 0 R >>');
    let pdf='%PDF-1.4\n%'+String.fromCharCode(226,227,207,211)+'\n';
    const offsets=[0];
    for(let i=1;i<objects.length;i++){
      offsets[i]=pdf.length;
      pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
    }
    const start=pdf.length;
    pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
    for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    pdf+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
    return new Blob([Uint8Array.from(pdf,ch=>ch.charCodeAt(0))],{type:'application/pdf'});
  }
  const slug=s=>String(s||'proveedor').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'proveedor';
  function createFile(data){
    const blob=createBlob(data);
    const name='pedido-'+slug(data.proveedor)+'-'+new Date().toISOString().slice(0,10)+'.pdf';
    return new File([blob],name,{type:'application/pdf'});
  }
  window.GestLokProviderPDF=Object.freeze({createBlob,createFile});
})();