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
            ctx.recalcular(h, it.k);
            if (it.k === "trab") {
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
ctx.OPCIONAL_TXT = { extra: ["Horas extra incluidas", "Opcional · desactivadas"], aus: ["Se descuenta del total", "Opcional · desactivado"], vac: ["Incluida en el total", "Opcional · desactivada"], agu: ["Incluido · monto manual", "Opcional · desactivado"] };
};
}
