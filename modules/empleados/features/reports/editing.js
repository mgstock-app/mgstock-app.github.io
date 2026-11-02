// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerEditing(scope, ctx) {
const { document, window, setTimeout } = scope;
ctx.entrarEdicion = function () {
    var h = ctx.S.srv[ctx.S.activo];
    if (!h || ctx.S.soloLectura)
        return;
    ctx.S.borrador = ctx.clon(h);
    ctx.S.borrador.items = ctx.normItems(h.items);
    ctx.S.borrador.tarifas = ctx.normTarifas(h.tarifas);
    ctx.S.borrador.ausente = ctx.activo(h, ctx.ITEM_AUS);
    ctx.S.borrador.ausJust = ctx.ausJustificado(h);
    ctx.S.borrador._tel = h.contacto && h.contacto.tel ? ctx.telTxt(h.contacto.tel) : "";
    if (ctx.liqPropia(h)) {
        if (!ctx.S.borrador.items.premio)
            ctx.S.borrador.items.premio = { c: null, i: null };
        ctx.S.borrador.premio = ctx.activo(h, ctx.ITEM_PREMIO);
        ctx.S.borrador.cats = ctx.normCats(h.cats);
    }
    ctx.S.borrador.fecha = ctx.hoyIso();
    ctx.S.editando = true;
    ctx.limpiarErrores();
    ctx.pintarTodo();
    setTimeout(function () { ctx.$("fNombre").focus(); }, 30);
};
ctx.salirEdicion = function (silencioso) { ctx.S.editando = false; ctx.S.borrador = null; ctx.limpiarErrores(); if (!silencioso)
    ctx.pintarTodo(); };
ctx.guardar = function () {
    if (!ctx.S.editando)
        return Promise.resolve(true);
    if (Object.keys(ctx.errores).length) {
        ctx.toast("Corregí los valores marcados en rojo antes de guardar.", "err");
        return Promise.resolve(false);
    }
    var id = ctx.S.activo, datos = ctx.camposDe(ctx.S.borrador);
    if (datos.contacto && datos.nombre)
        datos.contacto.nombre = datos.nombre;
    datos.fecha = ctx.hoyIso();
    datos.actualizado = new Date().toISOString();
    ctx.S.guardando = true;
    ctx.pintarBarra();
    return ctx.S.db.doc("hojas/" + id).update(datos).then(function () {
        var h = ctx.S.srv[id];
        if (h) {
            Object.keys(datos).forEach(function (k) { h[k] = ctx.clon(datos[k]); });
        }
        ctx.S.guardando = false;
        ctx.salirEdicion(true);
        ctx.S.carpeta = datos.puesto;
        ctx.S.ultimo[ctx.S.local + ":" + ctx.S.carpeta] = id;
        ctx.guardarPref();
        ctx.pintarTodo();
        ctx.toast("Cambios guardados con éxito");
        if (window.reportServices && window.reportServices.publish) return window.reportServices.publish(id).then(function () { ctx.toast("Cambios guardados e imagen publicada."); return true; }).catch(function () { ctx.toast("Datos guardados. No se pudo publicar la imagen; usá Publicar imagen para volver a intentar.", "err"); return true; });
        return true;
    }).catch(function (e) {
        ctx.S.guardando = false;
        if (e && e.code === "invalid_argument" && !ctx.S.esDuena) {
            ctx.S.soloLectura = true;
            ctx.salirEdicion(true);
            ctx.pintarTodo();
            ctx.infoPermiso();
            return false;
        }
        ctx.pintarBarra();
        ctx.toast(ctx.msgError(e), "err");
        return false;
    });
};
ctx.conGuardado = function (fn) { if (!ctx.S.editando) {
    fn();
    return;
} ctx.guardar().then(function (ok) { if (ok)
    fn(); }); };
ctx.pintarBarra = function () {
    var ed = ctx.S.editando, s = ctx.S.srv[ctx.S.activo];
    ctx.$("pillModo").textContent = ed ? "Modificando" : "Guardado";
    ctx.$("pillModo").classList.toggle("edit", ed);
    var e = s ? ctx.estadoHoja(s) : "vacia";
    ctx.$("chipEstado").className = "chip " + e;
    var chipTxt = s ? ctx.estadoTxt(s, e) : ctx.ESTADOS[e];
    if (e === "enviada" && s) {
        if (s.envioMedio && s.ultimaExport)
            chipTxt = "Enviado el " + ctx.fechaHoraTxt(s.ultimaExport);
        else if (ctx.esEfectivo(s))
            chipTxt = ctx.firmaVigente(s) ? "Firmado el " + ctx.fechaHoraTxt(s.firma.fecha) : "Recibo descargado el " + ctx.fechaHoraTxt(s.ultimaExport);
        else if (s.ultimaExport)
            chipTxt = "Enviado el " + ctx.fechaHoraTxt(s.ultimaExport);
    }
    ctx.$("chipEstado").textContent = chipTxt;
    ctx.$("barraTxt").textContent = ed ? "Cargá los datos y tocá Guardar." : (ctx.S.soloLectura ? "Modo lectura: tu permiso no deja guardar cambios. Pedile a la dueña que te invite por mail como Editor." : "");
    ctx.$("bModificar").hidden = ed || ctx.S.soloLectura;
    ctx.$("bCancelar").hidden = ctx.$("bGuardar").hidden = !ed;
    ctx.$("bGuardar").disabled = ctx.$("bCancelar").disabled = ctx.S.guardando;
    ctx.$("bGuardar").textContent = ctx.S.guardando ? "Guardando…" : "Guardar";
    ctx.$("papel").classList.toggle("editando", ed);
    ctx.$("papel").classList.toggle("lectura", !ed);
};
ctx.recalcular = function (h, k) {
    if (k === "aus" && ctx.ausJustificado(h)) {
        h.items.aus.i = null;
        return;
    }
    var t = ctx.tarifaDe(h, k), c = h.items[k].c;
    if (t != null && c != null)
        h.items[k].i = ctx.r2(c * t);
};
ctx.construirTabla = function () {
    var anio = new Date().getFullYear(), sa = ctx.$("fAnio");
    var o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = "Año";
    sa.appendChild(o0);
    for (var y = anio - 1; y <= anio + 2; y++) {
        var o = document.createElement("option");
        o.value = String(y);
        o.textContent = String(y);
        sa.appendChild(o);
    }
    var tb = ctx.$("tCuerpo");
    ctx.ITEMS.forEach(function (it) {
        var tr = document.createElement("tr");
        tr.id = "fila_" + it.k;
        var th = document.createElement("th");
        th.scope = "row";
        if (it.opcional) {
            th.innerHTML = '<div class="opt-cel"><button type="button" class="switch" role="switch" aria-checked="false" id="sw_' + it.k + '"></button><span><span class="opt-nom"></span><span class="opc" id="opc_' + it.k + '"></span></span></div>';
            th.querySelector(".opt-nom").textContent = it.txt;
            th.querySelector(".switch").setAttribute("aria-label", "Incluir " + it.txt.toLowerCase());
            if (it.k === "aus")
                th.insertAdjacentHTML("beforeend", '<label class="just" id="ljAus" hidden><input type="checkbox" id="fJust"><span>Ausente justificado <small>(ej. certificado médico)</small></span></label>');
        }
        else {
            var sp = document.createElement("span");
            sp.id = "lbl_" + it.k;
            sp.textContent = it.txt;
            th.appendChild(sp);
        }
        tr.appendChild(th);
        if (it.tipo === "monto") {
            var tdM = document.createElement("td");
            tdM.colSpan = 2;
            tdM.className = "span2";
            tdM.innerHTML = '<span class="sin-cant">Monto fijo</span>';
            tr.appendChild(tdM);
        }
        else {
            var tdC = document.createElement("td");
            tdC.setAttribute("data-lab", "Cantidad");
            tdC.innerHTML = '<div class="campo" id="cc_' + it.k + '"><input id="c_' + it.k + '" autocomplete="off" aria-label="Cantidad de ' + it.txt.toLowerCase() + '"><span class="uni" id="u_' + it.k + '"></span></div>';
            var tdV = document.createElement("td");
            tdV.setAttribute("data-lab", ctx.LIGADAS.indexOf(it.k) > -1 ? "Valor = trabajado" : "Valor unitario");
            tdV.innerHTML = '<div class="campo" id="cv_' + it.k + '"><span class="pre">$</span><input id="v_' + it.k + '" inputmode="decimal" autocomplete="off" aria-label="Valor unitario de ' + it.txt.toLowerCase() + '"><span class="uni" id="uv_' + it.k + '"></span></div>';
            tr.appendChild(tdC);
            tr.appendChild(tdV);
        }
        var tdI = document.createElement("td");
        tdI.className = "imp";
        tdI.setAttribute("data-lab", "Importe");
        tdI.innerHTML = '<div class="campo' + (it.resta ? ' resta' : '') + '" id="ci_' + it.k + '"><span class="pre">' + (it.resta ? '−&nbsp;$' : '$') + '</span><input id="i_' + it.k + '" inputmode="decimal" autocomplete="off" aria-label="Importe de ' + it.txt.toLowerCase() + '"></div>';
        tr.appendChild(tdI);
        tb.appendChild(tr);
        if (it.tipo !== "monto") {
            scope.listen(ctx.$("c_" + it.k), "input", function (e) { ctx.cambioNumero(it, "c", e.target); });
            scope.listen(ctx.$("v_" + it.k), "input", function (e) { ctx.cambioNumero(it, "v", e.target); });
            scope.listen(ctx.$("c_" + it.k), "blur", ctx.pintarValores);
            scope.listen(ctx.$("v_" + it.k), "blur", ctx.pintarValores);
        }
        scope.listen(ctx.$("i_" + it.k), "input", function (e) { ctx.cambioNumero(it, "i", e.target); });
        scope.listen(ctx.$("i_" + it.k), "blur", ctx.pintarValores);
        if (it.opcional)
            scope.listen(ctx.$("sw_" + it.k), "click", function () { if (!ctx.S.editando)
                return; ctx.S.borrador[it.opcional] = !ctx.S.borrador[it.opcional]; ctx.pintarValores(); });
        if (it.k === "aus")
            scope.listen(ctx.$("fJust"), "change", function (e) {
                if (!ctx.S.editando)
                    return;
                var h = ctx.S.borrador;
                h.ausJust = e.target.checked;
                delete ctx.errores["vaus"];
                delete ctx.errores["iaus"];
                ctx.$("cv_aus").classList.remove("mal");
                ctx.$("ci_aus").classList.remove("mal");
                ctx.recalcular(h, "aus");
                ctx.pintarValores();
            });
    });
    /* Munro: botones para sumar conceptos propios del local y ordenar los conceptos (iguales para todos los colaboradores). */
    var barra = document.createElement("div");
    barra.id = "liqBar";
    barra.className = "liq-bar";
    barra.hidden = true;
    barra.innerHTML = '<button type="button" class="btn sec" id="bAgregarCat">+ Agregar categoría</button><button type="button" class="btn sec" id="bOrdenCats">Ordenar conceptos</button>' +
        '<span class="hint">Valen para todos los colaboradores del local. El importe de cada uno se carga en su recibo.</span>';
    ctx.$("errTabla").parentNode.insertBefore(barra, ctx.$("errTabla"));
    scope.listen(ctx.$("bAgregarCat"), "click", function () { ctx.modalAgregarCat(); });
    scope.listen(ctx.$("bOrdenCats"), "click", function () { ctx.modalOrdenCats(); });
    scope.listen(ctx.$("fNombre"), "input", function (e) { if (ctx.S.editando)
        ctx.S.borrador.nombre = e.target.value; });
    scope.listen(ctx.$("fObs"), "input", function (e) { if (ctx.S.editando)
        ctx.S.borrador.obs = e.target.value; });
    scope.listen(ctx.$("fAlias"), "input", function (e) { if (ctx.S.editando)
        ctx.S.borrador.alias = e.target.value; });
    scope.listen(ctx.$("bCopiarAlias"), "click", function () { var h = ctx.S.srv[ctx.S.activo]; if (h && h.alias)
        ctx.copiarAlias(h.alias); });
    scope.listen(ctx.$("bPagoTr"), "click", function () { if (ctx.S.editando) {
        ctx.S.borrador.pago = "transferencia";
        ctx.pintarValores();
    } });
    scope.listen(ctx.$("bPagoEf"), "click", function () { if (ctx.S.editando) {
        ctx.S.borrador.pago = "efectivo";
        ctx.pintarValores();
    } });
    ctx.iniciarFirma();
    scope.listen(ctx.$("fTel"), "input", function (e) {
        if (!ctx.S.editando)
            return;
        var b = ctx.S.borrador, raw = e.target.value.trim();
        b._tel = e.target.value;
        if (!raw) {
            b.contacto = null;
            delete ctx.errores.tel;
        }
        else {
            var n = ctx.normalizarTel(raw);
            if (n) {
                b.contacto = { nombre: (b.contacto && b.contacto.nombre) || b.nombre || "", tel: n };
                delete ctx.errores.tel;
            }
            else
                ctx.errores.tel = "El WhatsApp no parece válido. Escribilo con código de área, sin 0 ni 15 (ej: 11 1234 5678).";
        }
        ctx.$("errTel").textContent = ctx.errores.tel || "";
        ctx.$("fTel").classList.toggle("mal", !!ctx.errores.tel);
    });
    scope.listen(ctx.$("fMes"), "change", function (e) { if (!ctx.S.editando)
        return; ctx.S.borrador.mes = e.target.value || ""; if (ctx.S.borrador.mes && !ctx.S.borrador.anio)
        ctx.S.borrador.anio = String(new Date().getFullYear()); ctx.pintarValores(); });
    scope.listen(ctx.$("fAnio"), "change", function (e) { if (ctx.S.editando) {
        ctx.S.borrador.anio = e.target.value || "";
        ctx.pintarValores();
    } });
    var ponerSemana = ctx.elegirSemana;
    scope.listen(ctx.$("fSemana"), "click", function (e) { e.stopPropagation(); if (!ctx.S.editando)
        return; if (ctx.$("semLista").hidden)
        ctx.abrirSemanas();
    else
        ctx.cerrarSemanas(); });
    scope.listen(document, "click", function (e) { if (!ctx.$("semLista").hidden && !ctx.$("semSel").contains(e.target))
        ctx.cerrarSemanas(); });
    scope.listen(document, "keydown", function (e) { if (e.key === "Escape" && !ctx.$("semLista").hidden) {
        ctx.cerrarSemanas();
        ctx.$("fSemana").focus();
    } });
    scope.listen(ctx.$("bSemAnt"), "click", function () { if (!ctx.S.editando)
        return; var base = ctx.S.borrador.semDesde ? ctx.lunesDe(ctx.S.borrador.semDesde) : ctx.lunesDe(ctx.hoyIso()); ponerSemana(ctx.S.borrador.semDesde ? ctx.sumarDias(base, -7) : base); });
    scope.listen(ctx.$("bSemSig"), "click", function () { if (!ctx.S.editando)
        return; var base = ctx.S.borrador.semDesde ? ctx.lunesDe(ctx.S.borrador.semDesde) : ctx.lunesDe(ctx.hoyIso()); ponerSemana(ctx.S.borrador.semDesde ? ctx.sumarDias(base, 7) : base); });
    scope.listen(ctx.$("fPuesto"), "change", function (e) { if (!ctx.S.editando)
        return; ctx.S.borrador.puesto = e.target.value;
        ctx.limpiarErrores(); ctx.pintarValores(); });
    scope.listen(ctx.$("bPorHoras"), "click", function () { if (ctx.S.editando) {
        ctx.S.borrador.porTurno = false;
        ctx.limpiarErrores();
        ctx.pintarValores();
    } });
    scope.listen(ctx.$("bPorTurnos"), "click", function () { if (ctx.S.editando) {
        if (["trab", "off", "fer"].some(function (key) { var value = ctx.S.borrador.items[key].c; return value != null && !Number.isInteger(value); })) {
            ctx.toast("Para cambiar a turnos, primero cargá cantidades enteras en trabajado, OFF y feriados.", "err"); return;
        }
        ctx.S.borrador.porTurno = true;
        ctx.limpiarErrores();
        ctx.pintarValores();
    } });
};
ctx.limpiarErrores = function () {
    ctx.errores = {};
    ctx.$("errTabla").textContent = "";
    ctx.$("errTel").textContent = "";
    ctx.$("fTel").classList.remove("mal");
    ctx.ITEMS.forEach(function (it) { ["cc_", "cv_", "ci_"].forEach(function (p) { if (ctx.$(p + it.k))
        ctx.$(p + it.k).classList.remove("mal"); }); });
    Object.keys(ctx.filasCat || {}).forEach(function (id) { var caja = ctx.$("ci_cat_" + id); if (caja)
        caja.classList.remove("mal"); });
};
/* ---------- Conceptos propios del local (Munro) ---------- */
ctx.filasCat = {};
ctx.puedeConfigLiq = function () {
    return !!ctx.S.db && !ctx.S.soloLectura && ctx.S.esDuena && !(window.REPORT_PERMISSIONS && !window.REPORT_PERMISSIONS.allowed("edit_reports"));
};
/* Conceptos que muestra la planilla: los del local (con el importe de esta hoja) y los que la hoja ya tenía cargados. */
ctx.catsVista = function (h) {
    var cfg = ctx.cfgLiqDe(h), propias = ctx.normCats(h.cats), porId = {}, r = [];
    propias.forEach(function (c) { porId[c.id] = c; });
    (cfg ? cfg.cats : []).forEach(function (c) { var p = porId[c.id]; r.push({ id: c.id, txt: c.txt, signo: c.signo, i: p ? p.i : null }); delete porId[c.id]; });
    propias.forEach(function (c) { if (porId[c.id] && c.i != null)
        r.push(c); });
    return r;
};
ctx.cambioCat = function (c, input) {
    if (!ctx.S.editando)
        return;
    var h = ctx.S.borrador, n = ctx.leerNumero(input.value), clave = "icat:" + c.id, caja = ctx.$("ci_cat_" + c.id);
    if (n !== null && isNaN(n)) {
        ctx.errores[clave] = "Revisá " + c.txt.toLowerCase() + ": escribí solo números.";
        caja.classList.add("mal");
    }
    else {
        delete ctx.errores[clave];
        caja.classList.remove("mal");
        if (!Array.isArray(h.cats))
            h.cats = [];
        var e = h.cats.filter(function (x) { return x.id === c.id; })[0];
        if (!e) {
            e = { id: c.id, txt: c.txt, signo: c.signo, i: null };
            h.cats.push(e);
        }
        e.txt = c.txt;
        e.signo = c.signo;
        e.i = n == null ? null : Math.abs(n);
    }
    var k = Object.keys(ctx.errores).filter(function (x) { return x !== "tel"; });
    ctx.$("errTabla").textContent = k.length ? ctx.errores[k[0]] : "";
    ctx.$("tTotal").textContent = ctx.pesos(ctx.totalDe(h));
};
ctx.filaCat = function (c) {
    var tr = ctx.filasCat[c.id];
    if (tr)
        return tr;
    tr = document.createElement("tr");
    tr.id = "fila_cat_" + c.id;
    tr.className = "fila-cat";
    tr.innerHTML = '<th scope="row"><span class="cat-cel"><span class="cat-nom"></span><span class="opc cat-signo"></span></span></th>' +
        '<td colspan="2" class="span2"><span class="sin-cant">Monto fijo</span></td>' +
        '<td class="imp" data-lab="Importe"><div class="campo" id="ci_cat_' + c.id + '"><span class="pre">$</span><input id="i_cat_' + c.id + '" inputmode="decimal" autocomplete="off"></div></td>';
    var input = tr.querySelector("input");
    scope.listen(input, "input", function (e) { var actual = ctx.catsVista(ctx.S.borrador || {}).filter(function (x) { return x.id === c.id; })[0] || c; ctx.cambioCat(actual, e.target); });
    scope.listen(input, "blur", ctx.pintarValores);
    ctx.filasCat[c.id] = tr;
    return tr;
};
ctx.pintarCats = function (h, ed) {
    var propia = ctx.liqPropia(h), lista = propia ? ctx.catsVista(h) : [], ids = {};
    lista.forEach(function (c) {
        ids[c.id] = true;
        var tr = ctx.filaCat(c), input = ctx.$("i_cat_" + c.id) || tr.querySelector("input"), caja = tr.querySelector(".campo"), resta = c.signo === "resta";
        tr.querySelector(".cat-nom").textContent = c.txt;
        tr.querySelector(".cat-signo").textContent = resta ? "Resta del total" : "Suma al total";
        tr.querySelector(".cat-signo").classList.toggle("resta", resta);
        caja.classList.toggle("resta", resta);
        caja.querySelector(".pre").innerHTML = resta ? "−&nbsp;$" : "$";
        input.setAttribute("aria-label", "Importe de " + c.txt.toLowerCase());
        if (document.activeElement !== input && !ctx.errores["icat:" + c.id])
            input.value = c.i == null ? "" : ctx.fmtImporte.format(c.i);
        input.placeholder = ed ? "0,00" : "—";
        input.disabled = !ed;
    });
    Object.keys(ctx.filasCat).forEach(function (id) {
        if (ids[id])
            return;
        var tr = ctx.filasCat[id];
        if (tr.parentNode)
            tr.parentNode.removeChild(tr);
        delete ctx.filasCat[id];
        delete ctx.errores["icat:" + id];
    });
    /* Orden común del local: se reacomodan las filas solo si cambió, para no perder el foco al escribir. */
    var tb = ctx.$("tCuerpo"), claves = ctx.ITEMS.map(function (it) { return it.k; }).concat(lista.map(function (c) { return ctx.claveCat(c.id); }));
    var deseadas = ctx.ordenCompleto(ctx.ordenDe(h), claves).map(function (k) { return k.indexOf("cat:") === 0 ? ctx.filasCat[k.slice(4)] : ctx.$("fila_" + k); }).filter(Boolean);
    var actuales = Array.prototype.filter.call(tb.children, function (el) { return el.tagName === "TR"; });
    if (deseadas.length !== actuales.length || deseadas.some(function (tr, i) { return actuales[i] !== tr; }))
        deseadas.forEach(function (tr) { tb.appendChild(tr); });
    ctx.$("liqBar").hidden = !(propia && ctx.puedeConfigLiq());
};
ctx.guardarCfgLiq = function (l, cfg) {
    var datos = ctx.normCfgLiq(cfg);
    datos.actualizado = new Date().toISOString();
    return ctx.S.db.doc("liquidacion/" + l).set(datos).then(function () {
        ctx.S.cfgLiq[l] = ctx.normCfgLiq(datos);
        ctx.pintarTodo();
    });
};
ctx.localLiqActivo = function () {
    var h = ctx.S.srv[ctx.S.activo];
    var l = h ? ctx.localDe(h) : ctx.S.local;
    return ctx.liqPropiaLocal(l) && ctx.puedeConfigLiq() ? l : null;
};
ctx.clavesLocal = function (l) {
    var cfg = ctx.S.cfgLiq[l] || { cats: [], orden: [] };
    return ctx.ITEMS.map(function (it) { return it.k; }).concat(cfg.cats.map(function (c) { return ctx.claveCat(c.id); }));
};
ctx.modalAgregarCat = function () {
    var l = ctx.localLiqActivo();
    if (!l)
        return;
    ctx.abrirModal('<h2 id="mTitulo">Agregar categoría</h2><p class="m-sub" id="mSubCat"></p>' +
        '<label class="t" for="mCatNom">Nombre del concepto</label><input type="text" id="mCatNom" maxlength="60" autocomplete="off" placeholder="Ej: Adelanto, Bono por presentismo">' +
        '<span class="t" id="lCatSigno">En el total</span><div class="segmento" role="radiogroup" aria-labelledby="lCatSigno"><button type="button" role="radio" id="mCatSuma" aria-checked="true">Suma</button><button type="button" role="radio" id="mCatResta" aria-checked="false">Resta</button></div>' +
        '<p class="hint">Aparece en el recibo de todos los colaboradores del local. El importe se carga a mano en cada recibo; si queda vacío, no figura.</p>' +
        '<p class="err-txt" id="mErr"></p><div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn prim" id="mOk">Agregar</button></div>');
    ctx.$("mSubCat").textContent = ctx.LOCALES[l].txt;
    var signo = "suma";
    var marcar = function (s) { signo = s; ctx.$("mCatSuma").setAttribute("aria-checked", s === "suma" ? "true" : "false"); ctx.$("mCatResta").setAttribute("aria-checked", s === "resta" ? "true" : "false"); };
    scope.listen(ctx.$("mCatSuma"), "click", function () { marcar("suma"); });
    scope.listen(ctx.$("mCatResta"), "click", function () { marcar("resta"); });
    var ok = function () {
        var txt = ctx.$("mCatNom").value.trim().replace(/\s+/g, " "), cfg = ctx.S.cfgLiq[l] || { cats: [], orden: [] };
        if (!txt) {
            ctx.$("mErr").textContent = "Escribí el nombre del concepto.";
            return;
        }
        var fijos = ctx.ITEMS.map(function (it) { return it.txt.toLowerCase(); });
        if (fijos.indexOf(txt.toLowerCase()) > -1 || cfg.cats.some(function (c) { return c.txt.toLowerCase() === txt.toLowerCase(); })) {
            ctx.$("mErr").textContent = "Ya hay un concepto con ese nombre.";
            return;
        }
        var id = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var nuevo = { cats: cfg.cats.concat([{ id: id, txt: txt, signo: signo }]), orden: ctx.ordenCompleto(cfg.orden, ctx.clavesLocal(l)).concat([ctx.claveCat(id)]) };
        ctx.$("mOk").disabled = true;
        ctx.guardarCfgLiq(l, nuevo).then(function () { ctx.cerrarModal(); ctx.toast("Categoría «" + txt + "» agregada para " + ctx.LOCALES[l].txt); }, function (e) { ctx.$("mOk").disabled = false; ctx.$("mErr").textContent = ctx.msgError(e); });
    };
    scope.listen(ctx.$("mOk"), "click", ok);
    scope.listen(ctx.$("mCatNom"), "keydown", function (e) { if (e.key === "Enter")
        ok(); });
};
ctx.modalOrdenCats = function () {
    var l = ctx.localLiqActivo();
    if (!l)
        return;
    var cfg = ctx.S.cfgLiq[l] || { cats: [], orden: [] }, cats = cfg.cats.slice(), orden = ctx.ordenCompleto(cfg.orden, ctx.clavesLocal(l));
    ctx.abrirModal('<h2 id="mTitulo">Ordenar conceptos</h2><p class="m-sub" id="mSubOrden"></p>' +
        '<ol class="orden-lista" id="mOrden"></ol>' +
        '<p class="hint">El orden es el mismo para todos los colaboradores del local. Cada recibo lo toma al guardarlo. Quitar una categoría no borra los importes ya cargados.</p>' +
        '<p class="err-txt" id="mErr"></p><div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn prim" id="mOk">Guardar orden</button></div>');
    ctx.$("mSubOrden").textContent = ctx.LOCALES[l].txt + " · tocá las flechas para subir o bajar";
    var nombre = function (k) {
        if (k.indexOf("cat:") === 0) {
            var c = cats.filter(function (x) { return ctx.claveCat(x.id) === k; })[0];
            return c ? c.txt + (c.signo === "resta" ? " (resta)" : " (suma)") : k;
        }
        var it = ctx.ITEMS.filter(function (x) { return x.k === k; })[0];
        return it ? it.txt : k;
    };
    var pintar = function () {
        var ol = ctx.$("mOrden");
        ol.textContent = "";
        orden.forEach(function (k, i) {
            var li = document.createElement("li"), t = document.createElement("span");
            t.className = "orden-nom";
            t.textContent = nombre(k);
            li.appendChild(t);
            var boton = function (txt, etiqueta, fn, deshab) {
                var b = document.createElement("button");
                b.type = "button";
                b.className = "btn sec orden-btn";
                b.textContent = txt;
                b.setAttribute("aria-label", etiqueta + " " + nombre(k));
                b.disabled = !!deshab;
                scope.listen(b, "click", fn);
                li.appendChild(b);
            };
            boton("↑", "Subir", function () { orden.splice(i - 1, 0, orden.splice(i, 1)[0]); pintar(); }, i === 0);
            boton("↓", "Bajar", function () { orden.splice(i + 1, 0, orden.splice(i, 1)[0]); pintar(); }, i === orden.length - 1);
            if (k.indexOf("cat:") === 0)
                boton("Quitar", "Quitar", function () { cats = cats.filter(function (c) { return ctx.claveCat(c.id) !== k; }); orden.splice(i, 1); pintar(); });
            ol.appendChild(li);
        });
    };
    pintar();
    scope.listen(ctx.$("mOk"), "click", function () {
        ctx.$("mOk").disabled = true;
        ctx.guardarCfgLiq(l, { cats: cats, orden: orden }).then(function () { ctx.cerrarModal(); ctx.toast("Orden de conceptos guardado para " + ctx.LOCALES[l].txt); }, function (e) { ctx.$("mOk").disabled = false; ctx.$("mErr").textContent = ctx.msgError(e); });
    });
};
ctx.cambioNumero = function (it0, campo, input) {
    if (!ctx.S.editando)
        return;
    var h = ctx.S.borrador, it = ctx.defItem(h, it0), n = campo === "c" && it.tipo === "horas" ? ctx.leerHoras(input.value) : ctx.leerNumero(input.value), msg = "";
    var caja = ctx.$((campo === "c" ? "cc_" : (campo === "v" ? "cv_" : "ci_")) + it.k);
    if (n !== null && isNaN(n))
        msg = "Revisá " + it.txt.toLowerCase() + (campo === "c" && it.tipo === "horas" ? ": usá horas:minutos (ej. 145:50), con minutos de 00 a 59." : ": escribí solo números.");
    else if ((campo === "c" || campo === "v") && n !== null && n < 0)
        msg = (campo === "c" ? "La cantidad" : "El valor unitario") + " de " + it.txt.toLowerCase() + " no puede ser negativo.";
    else if (campo === "c" && it.tipo !== "horas" && n !== null && n !== Math.floor(n))
        msg = it.txt + ": va en números enteros.";
    var clave = campo + it.k;
    if (msg) {
        ctx.errores[clave] = msg;
        caja.classList.add("mal");
    }
    else {
        delete ctx.errores[clave];
        caja.classList.remove("mal");
        var tocadas = [it.k];
        if (campo === "v") {
            h.tarifas[it.k] = n;
            if (it.k === "fer") {
                h.ferTarifaPropia = n != null;
                if (n == null) h.tarifas.fer = h.tarifas.trab;
            }
            ctx.recalcular(h, it.k);
            if (it.k === "trab") {
                if (!h.ferTarifaPropia) { h.tarifas.fer = n; ctx.recalcular(h, "fer"); tocadas.push("fer"); var fv = ctx.$("v_fer"); if (fv) fv.value = n == null ? "" : ctx.fmtImporte.format(n); }
                ctx.LIGADAS.forEach(function (k) { h.tarifas[k] = n; ctx.recalcular(h, k); tocadas.push(k); var iv = ctx.$("v_" + k); if (iv)
                    iv.value = n == null ? "" : ctx.fmtImporte.format(n); ctx.$("ci_" + k).classList.toggle("auto", n != null); });
            }
        }
        else if (campo === "c") {
            h.items[it.k].c = n;
            ctx.recalcular(h, it.k);
        }
        else
            h.items[it.k].i = (it.resta && n != null) ? Math.abs(n) : n;
        if (campo !== "i")
            tocadas.forEach(function (k) { var ii = ctx.$("i_" + k); if (document.activeElement !== ii)
                ii.value = h.items[k].i == null ? "" : ctx.fmtImporte.format(h.items[k].i); });
    }
    var k = Object.keys(ctx.errores).filter(function (x) { return x !== "tel"; });
    ctx.$("errTabla").textContent = k.length ? ctx.errores[k[0]] : "";
    ctx.$("tTotal").textContent = ctx.pesos(ctx.totalDe(h));
    ctx.$("tCantidadTotal").textContent = ctx.cantidadTotalTxt(h);
};
ctx.setVal = function (id, v) { var el = ctx.$(id); if (document.activeElement !== el)
    el.value = v; };
ctx.pintarSemanas = function (h, ed) {
    var actual = h.semDesde || "", hoyL = ctx.lunesDe(ctx.hoyIso());
    ctx.$("semTxt").textContent = actual ? ctx.semanaTxt(actual, h.semHasta) + (actual === hoyL ? " · esta semana" : "") : (ed ? "Elegir semana" : "Sin completar");
    ctx.$("fSemana").classList.toggle("es-hoy", actual === hoyL);
    ctx.$("bSemAnt").hidden = ctx.$("bSemSig").hidden = !ed;
    if (!ed)
        ctx.cerrarSemanas();
};
ctx.elegirSemana = function (lunes) { if (!ctx.S.editando)
    return; ctx.S.borrador.semDesde = lunes || ""; ctx.S.borrador.semHasta = lunes ? ctx.sumarDias(lunes, 6) : ""; ctx.pintarValores(); };
ctx.cerrarSemanas = function () { ctx.$("semLista").hidden = true; ctx.$("fSemana").setAttribute("aria-expanded", "false"); };
ctx.abrirSemanas = function () {
    var ul = ctx.$("semLista"), actual = (ctx.S.borrador && ctx.S.borrador.semDesde) || "", hoyL = ctx.lunesDe(ctx.hoyIso()), lunes = [];
    for (var i = -10; i <= 4; i++)
        lunes.push(ctx.sumarDias(hoyL, i * 7));
    if (actual && lunes.indexOf(actual) === -1) {
        lunes.push(actual);
        lunes.sort();
    }
    ul.textContent = "";
    var marcar = null;
    lunes.slice().reverse().forEach(function (l) {
        var li = document.createElement("li"), b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", l === actual ? "true" : "false");
        if (l === hoyL)
            b.className = "hoy";
        var t = document.createElement("span");
        t.textContent = ctx.semanaTxt(l);
        b.appendChild(t);
        if (l === hoyL) {
            var tag = document.createElement("span");
            tag.className = "tag";
            tag.textContent = "Esta semana";
            b.appendChild(tag);
        }
        var ok = document.createElement("span");
        ok.className = "ok";
        ok.textContent = "✓";
        ok.setAttribute("aria-hidden", "true");
        b.appendChild(ok);
        scope.listen(b, "click", function (e) { e.stopPropagation(); ctx.cerrarSemanas(); ctx.elegirSemana(l); ctx.$("fSemana").focus(); });
        li.appendChild(b);
        ul.appendChild(li);
        if (l === (actual || hoyL))
            marcar = b;
    });
    ul.hidden = false;
    ctx.$("fSemana").setAttribute("aria-expanded", "true");
    if (marcar) {
        ul.scrollTop = Math.max(0, marcar.offsetTop - ul.clientHeight / 2 + marcar.offsetHeight / 2);
        setTimeout(function () { marcar.focus({ preventScroll: true }); }, 0);
    }
};
return () => {
scope.listen(ctx.$("bModificar"), "click", ctx.entrarEdicion);
scope.listen(ctx.$("bGuardar"), "click", function () { ctx.guardar(); });
scope.listen(ctx.$("bCancelar"), "click", function () {
    if (!ctx.hayCambios()) {
        ctx.salirEdicion();
        return;
    }
    ctx.confirmar({ titulo: "Descartar los cambios", texto: "Se pierde lo que cargaste desde que tocaste Modificar.", boton: "Descartar", peligro: true, ok: function () { ctx.salirEdicion(); ctx.toast("Cambios descartados"); } });
});
ctx.OPCIONAL_TXT = { extra: ["Horas extra incluidas", "Opcional · desactivadas"], aus: ["Se descuenta del total", "Opcional · desactivado"], vac: ["Incluida en el total", "Opcional · desactivada"], agu: ["Incluido · monto manual", "Opcional · desactivado"], premio: ["Lo carga el dueño · suma al total", "Desactivado · no se paga"] };
};
}
