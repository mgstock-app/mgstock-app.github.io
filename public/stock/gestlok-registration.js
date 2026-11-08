/* Registration preferences are requests only. They never grant roles or modules. */
(() => {
  'use strict';
  const choices=Object.freeze({
    empleados:{label:'Administración de empleados',modules:['recibos_personal'],detail:'Recibos, personal, horarios y planillas.'},
    empresa:{label:'Administración de su empresa',modules:['comercial'],detail:'Productos, stock, proveedores y gestión comercial.'},
    ambas:{label:'Ambas',modules:['comercial','recibos_personal'],detail:'Empleados y gestión comercial desde la misma cuenta.'}
  });
  /* Catálogo de interés comercial: no activa módulos ni crea empresas.
     Las demos son simulaciones sin acceso a datos reales, cámara, caja ni WhatsApp. */
  const microapps=Object.freeze({
    scanner:{label:'Plan Scanner',icon:'▦',detail:'Ventas, carrito y códigos de barras desde el celular.',module:'comercial',intro:'Caja de demostración · carrito vacío',
      steps:[['Escanear producto','Producto ficticio agregado: Café de muestra × 1 · $4.500'],['Cobrar venta','Venta de prueba confirmada · inventario simulado actualizado']]},
    stock:{label:'Stock y proveedores',icon:'▤',detail:'Productos, reposición y pedidos a proveedores.',module:'comercial',intro:'Café de muestra · 5 unidades disponibles',
      steps:[['Registrar ingreso','Ingreso ficticio +10 unidades · stock: 15'],['Preparar pedido','Pedido de prueba preparado para un proveedor']]},
    precios:{label:'Precios y márgenes',icon:'$',detail:'Costos, precios de venta y rentabilidad.',module:'comercial',intro:'Producto de ejemplo · costo $2.000 · margen 50%',
      steps:[['Calcular precio','Precio de venta sugerido: $3.000 · ganancia $1.000'],['Guardar simulación','Precio de prueba guardado solo dentro de esta demo']]},
    pagos:{label:'Caja y pagos online',icon:'▣',detail:'Cobros, responsables, cierres e historial.',module:'comercial',intro:'Turno de ejemplo abierto · total $0',
      steps:[['Registrar cobro','Transferencia ficticia registrada · $8.000'],['Cerrar turno','Cierre de prueba · total $8.000']]},
    vencimientos:{label:'Control de vencimientos',icon:'◷',detail:'Fechas de vencimiento y alertas para prevenir pérdidas.',module:'comercial',intro:'Producto ficticio · vence dentro de 3 días',
      steps:[['Ver alerta','Alerta de vencimiento próximo identificada'],['Marcar revisado','Producto de ejemplo marcado como revisado']]},
    empleados:{label:'Personal y recibos',icon:'♙',detail:'Horarios, legajos, colaboradores y recibos privados.',module:'recibos_personal',intro:'Equipo de prueba · sin horarios asignados',
      steps:[['Asignar turno','Turno ficticio asignado: mañana, 08:00–16:00'],['Ver recibo','Recibo de prueba visible únicamente para su colaborador']]},
    pedidos:{label:'Pedidos y clientes',icon:'▥',detail:'Solicitudes, seguimiento y confirmación de pedidos.',module:'comercial',intro:'Pedido de ejemplo recibido · pendiente',
      steps:[['Revisar solicitud','Pedido ficticio: 2 productos · $9.000 · pendiente'],['Confirmar pedido','Pedido de prueba confirmado por una persona del local']]}
  });
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedApps=form=>[...form.querySelectorAll('[data-microapp-id]:checked')].map(input=>input.value).filter(id=>Object.hasOwn(microapps,id));
  function choiceForApps(ids){
    const modules=new Set(ids.map(id=>microapps[id]?.module).filter(Boolean));
    if(modules.has('comercial')&&modules.has('recibos_personal'))return 'ambas';
    if(modules.has('comercial'))return 'empresa';
    if(modules.has('recibos_personal'))return 'empleados';
    return '';
  }
  function demo(form,id,step=0){
    const target=form.querySelector('[data-microapp-preview]');
    const app=microapps[id];if(!target||!app)return;
    const index=Math.max(0,Math.min(step,app.steps.length));
    const next=app.steps[index];
    target.hidden=false;target.dataset.demoId=id;target.dataset.demoStep=String(index);
    target.innerHTML=`<div class="gl-microapp-demo-title"><div><small>Vista de prueba · Datos ficticios</small><h3>${esc(app.label)}</h3></div><button type="button" data-demo-close aria-label="Cerrar demo">×</button></div>
      <p class="gl-microapp-demo-caption">${esc(app.intro)}</p>
      <div class="gl-microapp-demo-display" role="status" aria-live="polite">${index?esc(app.steps[index-1][1]):'Probá un paso para ver cómo responde la microapp.'}</div>
      <div class="gl-microapp-demo-actions">
        <button type="button" class="btn primary" data-demo-next>${esc(next?next[0]:'Reiniciar demo')}</button>
        <button type="button" class="btn" data-demo-select>${selectedApps(form).includes(id)?'✓ Microapp seleccionada':'Agregar esta microapp'}</button>
      </div>
      <small>Ejemplo interactivo. No se guardan ventas, datos ni mensajes reales.</small>`;
  }
  let activeEmail='',pendingTask;
  function parse(kind,choice){
    if(kind==='colaborador')return {kind,choice:'',modules:[]};
    if(kind!=='dueno'||!Object.hasOwn(choices,choice))throw Error('Elegí el tipo de cuenta y qué querés administrar.');
    return {kind,choice,modules:[...choices[choice].modules]};
  }
  function fields(prefix){
    const box=document.createElement('div');box.className='gl-registration-fields';
    box.innerHTML=`<div class="fld"><label for="${prefix}-kind">Tipo de cuenta</label><select id="${prefix}-kind" data-registration-kind required><option value="">Elegí una opción</option><option value="dueno">Soy dueño/a</option><option value="colaborador">Soy colaborador/a de una empresa</option></select></div>
      <fieldset class="gl-registration-business" data-registration-business-field hidden><legend>Datos de tu negocio</legend>
        <p>Se guardan en tu ficha privada de empresa. Solo la administración autorizada podrá revisarlos.</p>
        <div class="fld"><label for="${prefix}-company">Nombre del negocio</label><input id="${prefix}-company" data-business="name" maxlength="100" minlength="2" autocomplete="organization" placeholder="Ej.: El Molino Café"></div>
        <div class="fld"><label for="${prefix}-responsible">Nombre y apellido de la persona encargada</label><input id="${prefix}-responsible" data-business="responsible" maxlength="100" minlength="3" autocomplete="name" placeholder="Nombre y apellido"></div>
        <div class="fld"><label for="${prefix}-phone">Teléfono de contacto</label><input id="${prefix}-phone" data-business="phone" type="tel" maxlength="25" autocomplete="tel" placeholder="+54 11 1234-5678" inputmode="tel"></div>
        <div class="fld"><label for="${prefix}-address">Nombre del local, dirección o referencia (opcional)</label><input id="${prefix}-address" data-business="address" data-business-optional="true" maxlength="160" autocomplete="street-address" placeholder="Podés dejarlo vacío si no tenés local fijo"></div>
      </fieldset>
      <div class="fld" data-registration-module-field hidden><label for="${prefix}-modules">Áreas que solicitás</label><select id="${prefix}-modules" data-registration-choice><option value="">Elegí una opción</option>${Object.entries(choices).map(([key,c])=>`<option value="${key}">${c.label}</option>`).join('')}</select><small id="${prefix}-detail" data-registration-detail></small></div>
      <fieldset class="gl-registration-microapps" data-registration-microapps hidden>
        <legend>Elegí tus microapps</legend>
        <p class="gl-microapps-intro">Podés combinar <b>varias microapps en un mismo negocio</b>. Todas pueden personalizarse según tus necesidades.</p>
        <div class="gl-microapps-grid">${Object.entries(microapps).map(([id,app])=>`<div class="gl-microapp-card"><label for="${prefix}-micro-${id}"><input type="checkbox" id="${prefix}-micro-${id}" data-microapp-id value="${id}"><span class="gl-microapp-card-text"><b>${esc(app.label)}</b><small>${esc(app.detail)}</small></span></label><button type="button" data-demo-open="${id}">Probar demo interactiva</button></div>`).join('')}</div>
        <div class="gl-microapps-selection" aria-live="polite" data-microapps-selection>Elegí las microapps que quieras conocer.</div>
        <div class="gl-microapp-preview" data-microapp-preview hidden></div>
        <label for="${prefix}-custom">¿Qué te gustaría personalizar? (opcional)</label>
        <textarea id="${prefix}-custom" data-customization maxlength="600" rows="3" placeholder="Contanos qué tipo de negocio tenés, cuántos locales y qué tareas querés simplificar…"></textarea>
        <p class="gl-microapps-disclaimer">Esta elección es una solicitud para preparar tu sistema. No activa servicios ni genera cargos automáticamente.</p>
      </fieldset>`;
    return box;
  }
  function sync(form){
    const owner=form.querySelector('[data-registration-kind]').value==='dueno';
    form.querySelector('[data-registration-module-field]').hidden=true;
    const microField=form.querySelector('[data-registration-microapps]');
    if(microField)microField.hidden=!owner;
    const company=form.querySelector('[data-registration-business-field]');
    if(company){
      company.hidden=!owner;
      company.querySelectorAll('input').forEach(input=>{
        input.required=owner&&input.dataset.businessOptional!=='true';
      });
    }
    const select=form.querySelector('[data-registration-choice]');select.required=false;
    const apps=selectedApps(form);
    select.value=owner?choiceForApps(apps):'';
    const summary=form.querySelector('[data-microapps-selection]');
    if(summary)summary.textContent=apps.length
      ? apps.length+' microapp'+(apps.length===1?' seleccionada':'s seleccionadas')+' · '+(choices[select.value]?.label||'')
      : 'Elegí al menos una microapp. Podés combinar todas las que necesites.';
    form.querySelector('[data-registration-detail]').textContent=choices[select.value]?.detail||'';
  }
  function read(form){
    const kind=form.querySelector('[data-registration-kind]')?.value;
    if(kind!=='dueno')return parse(kind,'');
    const microappIds=selectedApps(form);
    if(!microappIds.length)throw Error('Elegí al menos una microapp para tu negocio.');
    const intent=parse(kind,choiceForApps(microappIds));
    const get=key=>String(form.querySelector('[data-business="'+key+'"]')?.value||'').trim();
    const business={
      name:get('name'), responsible:get('responsible'),
      phone:get('phone'), address:get('address'),
      microapps:microappIds,
      customization:String(form.querySelector('[data-customization]')?.value||'').trim()
    };
    const digits=business.phone.replace(/\D/g,'');
    if(business.name.length<2||business.name.length>100||
       business.responsible.length<3||business.responsible.length>100||
       digits.length<10||digits.length>15||
       !/^[+0-9 ()-]{9,25}$/.test(business.phone)||business.address.length>160||business.customization.length>600)
      throw Error('Completá el negocio, la persona encargada y un teléfono válido.');
    return {...intent,business};
  }
  function mountSignup(){
    const form=document.querySelector('#au-up');
    if(!form||form.querySelector('.gl-registration-fields'))return;
    form.querySelector('.fld').before(fields('gl-signup'));
    form.querySelector('h1').textContent='Creá tu cuenta en GESTLOK';
    form.querySelector('p').textContent='Si tenés un negocio, elegí y probá las microapps que necesitás. Tu solicitud será revisada antes de habilitar el acceso.';
    for(const id of ['#au-pass2','#au-pass3']){
      const input=form.querySelector(id);if(input)input.minLength=8;
    }
    const secret=form.querySelector('#au-pass3')?.closest('.fld');
    if(secret&&!secret.querySelector('[data-registration-password-hint]')){
      const hint=document.createElement('small');hint.dataset.registrationPasswordHint='';
      hint.textContent='Usá al menos 8 caracteres. No compartas tu contraseña con la administradora.';
      secret.append(hint);
    }
    if(!form.querySelector('[data-registration-terms]')){
      const terms=document.createElement('label');
      terms.className='gl-registration-terms';terms.dataset.registrationTerms='';
      terms.innerHTML='<input type="checkbox" required name="terms"> <span>Leí y acepto los <a href="/terminos.html" target="_blank" rel="noopener noreferrer">Términos de uso</a> y la <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Política de privacidad</a>.</span>';
      form.querySelector('button[type="submit"]').before(terms);
    }
  }
  function message(form,text,error=false){
    const output=form.querySelector('[data-registration-status]');output.textContent=text;
    output.className=error?'au-msg err':'au-msg';
  }
  function busy(form,on){form.querySelectorAll('button,select').forEach(el=>{el.disabled=on;});}
  function fill(form,kind,modules,business=null){
    const choice=Object.keys(choices).find(key=>choices[key].modules.join(',')===(modules||[]).join(','))||'';
    form.querySelector('[data-registration-kind]').value=kind;
    const known=Array.isArray(business?.microapps)?business.microapps.filter(id=>Object.hasOwn(microapps,id)):[];
    const fallback=choice==='ambas'?['stock','empleados']:choice==='empresa'?['stock']:choice==='empleados'?['empleados']:[];
    const selection=known.length?known:fallback;
    form.querySelectorAll('[data-microapp-id]').forEach(box=>{box.checked=selection.includes(box.value);});
    const customization=form.querySelector('[data-customization]');
    if(customization)customization.value=business?.customization_notes||business?.customization||'';
    sync(form);
    if(business)for(const [key,value] of Object.entries({
      name:business.business_name||business.name,
      responsible:business.responsible_name||business.responsible,
      phone:business.contact_phone||business.phone,
      address:business.business_address||business.address
    })){const input=form.querySelector('[data-business="'+key+'"]');if(input)input.value=value||'';}
  }
  async function submit(form){
    let intent;try{intent=read(form);}catch(e){message(form,e.message,true);return;}
    busy(form,true);
    try{
      const method=intent.kind==='dueno'?'gestlok_request_business_registration_v2':'gestlok_request_registration';
      const params=intent.kind==='dueno'?{
        p_modules:intent.modules,p_business_name:intent.business.name,
        p_responsible_name:intent.business.responsible,
        p_contact_phone:intent.business.phone,p_business_address:intent.business.address,
        p_microapps:intent.business.microapps,p_customization:intent.business.customization
      }:{p_kind:intent.kind,p_modules:intent.modules};
      const {error}=await window.GestLokSupabase.rpc(method,params);
      if(error)throw error;
      message(form,'Solicitud guardada. La administradora revisará tu cuenta y los módulos solicitados.');
    }catch{message(form,'No se pudo guardar la solicitud. Revisá la conexión y volvé a intentarlo.',true);}
    finally{busy(form,false);}
  }
  function pending(session){
    const email=String(session?.user?.email||'').toLowerCase();
    if(email===activeEmail&&pendingTask)return pendingTask;
    activeEmail=email;
    pendingTask=(async()=>{
      const parent=document.querySelector('[data-mode="pend"]');if(!parent)return;
      let form=parent.querySelector('#gl-registration-request');
      if(!form){
        form=document.createElement('form');form.id='gl-registration-request';
        const title=document.createElement('h2');title.textContent='Tu solicitud de acceso';
        const note=document.createElement('p');note.textContent='Elegí cómo vas a usar GESTLOK. La administradora habilitará los módulos y el acceso a tu empresa.';
        const button=document.createElement('button');button.className='btn primary';button.type='submit';button.textContent='Guardar solicitud';
        const output=document.createElement('p');output.setAttribute('role','status');output.setAttribute('aria-live','polite');output.dataset.registrationStatus='';
        form.append(title,note,fields('gl-request'),button,output);
        parent.querySelector('button').before(form);
      }
      busy(form,true);
      try{
        const {data,error}=await window.GestLokSupabase.rpc('gestlok_my_registration');
        if(error)throw error;
        if(email!==activeEmail)return;
        if(data){fill(form,data.kind,data.modules,data);message(form,data.status==='rejected'?'Tu solicitud fue rechazada. Podés revisarla y enviarla nuevamente.':'Tu solicitud está guardada y pendiente de revisión.');}
        else{
          const meta=session.user.user_metadata?.gestlok_registration;
          if(meta){
            let intent;try{intent=parse(meta.kind,meta.choice);}catch{return;}
            fill(form,intent.kind,intent.modules,session.user.user_metadata?.gestlok_business);
            if(intent.kind==='dueno'&&!session.user.user_metadata?.gestlok_business)
              message(form,'Completá los datos de tu negocio y guardá la solicitud.');
            else await submit(form);
          }
        }
      }catch{message(form,'Completá tu solicitud y tocá Guardar. Si no se guarda, revisá la conexión.',true);}
      finally{if(email===activeEmail)busy(form,false);}
    })();
    return pendingTask;
  }
  function label(request){
    if(request?.tipoCuenta==='colaborador')return 'Solicitud de colaborador/a';
    if(request?.tipoCuenta!=='dueno')return '';
    const found=Object.values(choices).find(c=>JSON.stringify(c.modules)===JSON.stringify(request.modulosSolicitados));
    return found?'Solicitud de dueño/a · '+found.label:'Solicitud de dueño/a · Módulos pendientes';
  }
  document.addEventListener('change',e=>{
    if(e.target.matches('[data-registration-kind],[data-microapp-id]')){
      const form=e.target.closest('form');sync(form);
      const preview=form?.querySelector('[data-microapp-preview]');
      if(preview&&!preview.hidden)demo(form,preview.dataset.demoId,Number(preview.dataset.demoStep||0));
    }
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-demo-open],[data-demo-next],[data-demo-close],[data-demo-select]');
    if(!button)return;
    const form=button.closest('form');if(!form)return;
    e.preventDefault();
    const preview=form.querySelector('[data-microapp-preview]');
    if(button.hasAttribute('data-demo-open')){demo(form,button.dataset.demoOpen,0);return;}
    if(button.hasAttribute('data-demo-close')){preview.hidden=true;return;}
    const id=preview?.dataset.demoId;if(!id||!Object.hasOwn(microapps,id))return;
    if(button.hasAttribute('data-demo-next')){const i=Number(preview.dataset.demoStep||0);demo(form,id,i>=microapps[id].steps.length?0:i+1);}
    if(button.hasAttribute('data-demo-select')){
      const checkbox=[...form.querySelectorAll('[data-microapp-id]')].find(x=>x.value===id);
      if(checkbox){checkbox.checked=true;sync(form);demo(form,id,Number(preview.dataset.demoStep||0));}
    }
  });
  document.addEventListener('submit',e=>{if(e.target.id==='gl-registration-request'){e.preventDefault();submit(e.target);}},true);
  window.GestLokRegistration=Object.freeze({mountSignup,pending,read,parse,label,microappLabel:id=>microapps[id]?.label||id,choiceForApps});
})();
