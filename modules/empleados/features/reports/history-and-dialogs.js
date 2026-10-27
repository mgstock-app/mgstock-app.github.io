// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerHistoryAndDialogs(scope, ctx) {
const { document, window, setTimeout } = scope;
ctx.pintarTodo = function () {
    queueMicrotask(function () { if (window.enforceReportUI)
        window.enforceReportUI(document); });
    ctx.$("vCargando").hidden = ctx.S.cargado;
    ctx.$("bNota").hidden = !(ctx.S.cargado && !ctx.S.esDuena && ctx.S.db);
    ctx.$("bGuardarNube").hidden = !(ctx.S.cargado && ctx.S.esDuena && !ctx.S.soloLectura && ctx.S.db);
    var hay = ctx.S.orden.length > 0, bloqueada = ctx.S.cargado && !hay && ctx.S.soloLectura;
    ctx.$("vSinAcceso").hidden = !bloqueada;
    ctx.$("vInicio").hidden = !ctx.S.cargado || bloqueada || ctx.S.pantalla !== "inicio";
    ctx.$("vLocal").hidden = !ctx.S.cargado || bloqueada || ctx.S.pantalla !== "local";
    if (!ctx.S.cargado || bloqueada)
        return;
    if (ctx.S.pantalla === "inicio") {
        ctx.pintarInicio();
        return;
    }
    ctx.pintarLocal();
    var res = ctx.S.carpeta === "resumen";
    ctx.$("vResumen").hidden = !res;
    ctx.$("vCategoria").hidden = res;
    if (res) {
        ctx.pintarResumen();
        return;
    }
    ctx.pintarPersonas();
    var vacia = !ctx.S.activo;
    ctx.$("vVacio").hidden = !vacia;
    ctx.$("vHoja").hidden = vacia;
    ctx.$("tVacio").textContent = "Todavía no hay hojas en " + ctx.CARPETAS[ctx.S.carpeta] + " de " + ctx.LOCALES[ctx.S.local].txt;
    ctx.$("bPrimera").hidden = ctx.S.soloLectura;
    if (!vacia) {
        ctx.pintarValores();
        ctx.pintarHistorial();
    }
};
ctx.suscribirHistorial = function () {
    if (ctx.S.unsubHist) {
        ctx.S.unsubHist();
        ctx.S.unsubHist = null;
    }
    ctx.F.rehacer = false;
    ctx.limpiarCanvas();
    ctx.S.hist = [];
    if (!ctx.S.db || !ctx.S.activo || (window.REPORT_PERMISSIONS && !window.REPORT_PERMISSIONS.allowed('view_history')))
        return;
    var id = ctx.S.activo;
    ctx.S.unsubHist = ctx.S.db.collection("hojas/" + id + "/historial").orderBy("registrado", "desc").onSnapshot(function (snap) {
        if (ctx.S.activo !== id)
            return;
        ctx.S.hist = snap.docs.map(function (d) { return { id: d.id, d: d.data() }; });
        ctx.pintarHistorial();
    }, function () { ctx.S.unsubHist = null; });
};
ctx.celda = function (tr, txt, cls) { var td = document.createElement("td"); td.textContent = txt; if (cls)
    td.className = cls; tr.appendChild(td); };
ctx.pintarHistorial = function () {
    var tb = ctx.$("hCuerpo");
    tb.textContent = "";
    ctx.$("hVacio").hidden = ctx.S.hist.length > 0;
    ctx.$("histWrap").hidden = !ctx.S.hist.length;
    ctx.S.hist.forEach(function (r) {
        var d = r.d, it = d.items || {}, tr = document.createElement("tr"), tt = ctx.esTurno(d) ? "turnos" : "horas";
        var v = function (k, c) { return it[k] ? it[k][c] : null; }, p = function (k) { return v(k, "i") == null ? "—" : ctx.pesos(v(k, "i")); };
        var tv = document.createElement("td");
        tv.className = "izq";
        var bv = document.createElement("button");
        bv.type = "button";
        bv.className = "ver";
        bv.textContent = "Ver";
        bv.setAttribute("aria-label", "Ver el reporte registrado el " + ctx.fechaHoraTxt(d.registrado));
        scope.listen(bv, "click", function () { ctx.verReporteHistorial(d); });
        tv.appendChild(bv);
        if (!ctx.S.soloLectura && ctx.S.esDuena) {
            var x = document.createElement("button");
            x.type = "button";
            x.className = "x";
            x.textContent = "×";
            x.title = "Borrar este reporte del historial";
            x.setAttribute("aria-label", "Borrar el reporte registrado el " + ctx.fechaHoraTxt(d.registrado));
            scope.listen(x, "click", function () { ctx.confirmarBorrarRegistro(r); });
            tv.appendChild(x);
        }
        tr.appendChild(tv);
        ctx.celda(tr, ctx.fechaHoraTxt(d.registrado), "izq");
        var per = d.periodo || (d.mes ? d.mes + (d.anio ? " " + d.anio : "") : (d.fecha ? ctx.fechaTxt(d.fecha) : ""));
        ctx.celda(tr, per || "—", "izq");
        ctx.celda(tr, ctx.cantTxt(tt, v("trab", "c")));
        ctx.celda(tr, p("trab"));
        ctx.celda(tr, ctx.cantTxt(tt, v("off", "c")));
        ctx.celda(tr, p("off"));
        ctx.celda(tr, ctx.cantTxt(tt, v("fer", "c")));
        ctx.celda(tr, p("fer"));
        if (!ctx.activo(d, ctx.ITEM_AUS)) {
            ctx.celda(tr, "—");
            ctx.celda(tr, "—");
        }
        else {
            ctx.celda(tr, ctx.cantTxt("dias", v("aus", "c")));
            ctx.celda(tr, ctx.ausJustificado(d) ? "Justificado" : ctx.importeTxt(ctx.ITEM_AUS, v("aus", "i"), "—"));
        }
        ctx.celda(tr, d.vac ? p("vac") : "—");
        ctx.celda(tr, d.agu ? p("agu") : "—");
        ctx.celda(tr, ctx.pesos(d.total), "tot");
        ctx.celda(tr, d.enviadoA || "—", "izq");
        tb.appendChild(tr);
    });
};
ctx.verReporteHistorial = function (d) {
    var hoja = ctx.S.srv[ctx.S.activo] || {}, h = ctx.clon(d);
    h.local = d.local || ctx.localDe(hoja);
    h.items = ctx.normItems(d.items);
    h.tarifas = ctx.normTarifas(d.tarifas);
    if (h.alias == null)
        h.alias = "";
    h.firma = null;
    h.periodoFijo = d.periodo || "";
    var nombre = d.nombre || hoja.nombre || "", url = null;
    ctx.abrirModal('<h2 id="mTitulo">Reporte del historial</h2><p class="m-sub" id="vSub"></p>' +
        '<div class="vista-hist" id="vImg"><p class="cargando-img">Armando el reporte…</p></div>' +
        '<p class="hint" id="vNota"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" id="vCerrar">Cerrar</button></div>');
    ctx.$("modal").classList.add("ancho");
    ctx.$("vSub").textContent = "Registrado el " + ctx.fechaHoraTxt(d.registrado) + " · " + (d.enviadoA || "Guardado sin enviar");
    var notas = [];
    if (typeof d.total === "number" && Math.abs(ctx.totalDe(h) - d.total) > 0.009)
        notas.push("Total registrado en ese momento: " + ctx.pesos(d.total) + ".");
    if (ctx.esEfectivo(h))
        notas.push(d.firmado ? "Pago en efectivo · el colaborador firmó en pantalla." : "Pago en efectivo.");
    ctx.$("vNota").textContent = notas.join(" ");
    ctx.$("vNota").hidden = !notas.length;
    scope.listen(ctx.$("vCerrar"), "click", ctx.cerrarModal);
    var lz = new ctx.LienzoDoc(6);
    lz.pie = "Reporte registrado el " + ctx.fechaHoraTxt(d.registrado) + " · GESTLOK";
    ctx.fuentesListas().then(function () { ctx.crearPdf(h, nombre, lz); return lz.aBlob(); }).then(function (b) {
        if (!ctx.$("vImg"))
            return;
        url = URL.createObjectURL(b);
        var im = document.createElement("img");
        im.alt = "Reporte registrado el " + ctx.fechaHoraTxt(d.registrado);
        im.src = url;
        im.onload = function () { setTimeout(function () { try {
            URL.revokeObjectURL(url);
        }
        catch (e) { } }, 1000); };
        ctx.$("vImg").textContent = "";
        ctx.$("vImg").appendChild(im);
    }, function () { if (ctx.$("vImg"))
        ctx.$("vImg").innerHTML = '<p class="cargando-img">No se pudo armar el reporte en este dispositivo.</p>'; });
};
ctx.registrarHistorialDe = function (id, origen) {
    var h = ctx.S.srv[id];
    if (!h)
        return Promise.resolve();
    var reg = { registrado: new Date().toISOString(), fecha: h.fecha || "", periodo: ctx.periodoTxt(h), mes: h.mes || "", anio: h.anio || "", semDesde: h.semDesde || "", semHasta: h.semHasta || "",
        nombre: h.nombre || "", local: ctx.localDe(h), puesto: ctx.puestoDe(h), porTurno: ctx.esTurno(h), pago: ctx.pagoDe(h), alias: String(h.alias || "").trim(), firmado: ctx.esEfectivo(h) && ctx.firmaVigente(h), ausente: ctx.activo(h, ctx.ITEM_AUS), ausJust: ctx.ausJustificado(h), vac: !!h.vac, agu: !!h.agu, obs: h.obs || "",
        items: ctx.normItems(h.items), tarifas: ctx.normTarifas(h.tarifas), total: ctx.totalDe(h), enviadoA: origen || "Guardado sin enviar" };
    return ctx.S.db.collection("hojas/" + id + "/historial").add(reg);
};
ctx.abrirModal = function (html) {
    ctx.$("modal").innerHTML = html;
    ctx.$("modal").classList.remove("ancho");
    ctx.$("overlay").hidden = false;
    ctx.modalCerrable = true;
    Array.prototype.forEach.call(ctx.$("modal").querySelectorAll("[data-cerrar]"), function (b) { scope.listen(b, "click", ctx.cerrarModal); });
    var f = ctx.$("modal").querySelector("input[type=text],input[type=tel],.prim,button");
    if (f)
        setTimeout(function () { f.focus(); }, 30);
};
ctx.cerrarModal = function () { ctx.$("overlay").hidden = true; ctx.$("modal").textContent = ""; ctx.$("modal").classList.remove("ancho"); };
ctx.seguirModificando = function (id, txt) {
    ctx.cerrarModal();
    var abrir = function () { ctx.entrarEdicion(); ctx.toast(txt || "Operación cancelada · podés seguir modificando la hoja"); };
    if (id && id !== ctx.S.activo) {
        ctx.irA(id);
        setTimeout(abrir, 0);
    }
    else
        abrir();
};
ctx.confirmarReporte = function (h, accion, alAceptar) {
    var a = ctx.ACCIONES[accion];
    ctx.abrirModal('<h2 id="mTitulo">Confirmación de reporte</h2><p class="m-sub">Antes de continuar, verifique que los datos del reporte sean correctos.</p>' +
        '<dl class="resumen-envio"><dt>Colaborador</dt><dd id="cfNom"></dd><dt>Período</dt><dd id="cfPer"></dd><dt>Forma de pago</dt><dd id="cfPago"></dd><dt>Total a pagar</dt><dd id="cfTot" class="num"></dd></dl>' +
        '<p class="conf-preg" id="cfPreg"></p><p class="hint" id="cfNota"></p><p class="err-txt" id="mErr"></p>' +
        '<div class="m-acc"><button type="button" class="btn sec" id="cfRech">Rechazar</button><button type="button" class="btn prim" id="cfAcep">Aceptar</button></div>');
    ctx.$("cfNom").textContent = ctx.nombreColab(h) || "Sin nombre cargado";
    ctx.$("cfPer").textContent = ctx.periodoTxt(h) || "Sin completar";
    ctx.$("cfPago").textContent = ctx.pagoTxt(h);
    ctx.$("cfTot").textContent = ctx.pesos(ctx.totalDe(h));
    ctx.$("cfPreg").textContent = "¿Confirma que el reporte está listo para " + a.preg + "?";
    ctx.$("cfNota").textContent = accion === "whatsapp" ? "Al compartir se registra Enviado y se guarda una copia en tu historial privado. Si lo rechazás, podés seguir modificando la hoja." : "Al aceptar, el reporte se guarda en el historial de la hoja y continúa " + a.sigue + ". Si lo rechaza, puede seguir modificando la hoja.";
    scope.listen(ctx.$("cfRech"), "click", function () { ctx.seguirModificando(null); });
    scope.listen(ctx.$("cfAcep"), "click", function () {
        ctx.$("cfAcep").disabled = ctx.$("cfRech").disabled = true;
        ctx.modalCerrable = false;
        Promise.resolve().then(alAceptar).catch(function (e) {
            ctx.modalCerrable = true;
            if (ctx.$("cfAcep")) {
                ctx.$("cfAcep").disabled = ctx.$("cfRech").disabled = false;
                ctx.$("mErr").textContent = ctx.msgError(e);
            }
            else
                ctx.toast(ctx.msgError(e), "err");
        });
    });
};
ctx.confirmar = function (o) {
    ctx.abrirModal('<h2 id="mTitulo"></h2><p class="m-sub" id="mTxt"></p><p class="err-txt" id="mErr"></p><div class="m-acc"><button type="button" class="btn sec" data-cerrar>' + (o.cancelar || "Cancelar") + '</button><button type="button" class="btn ' + (o.peligro ? "rojo" : "prim") + '" id="mOk"></button></div>');
    ctx.$("mTitulo").textContent = o.titulo;
    ctx.$("mTxt").textContent = o.texto;
    ctx.$("mOk").textContent = o.boton;
    scope.listen(ctx.$("mOk"), "click", function () {
        ctx.$("mOk").disabled = true;
        Promise.resolve().then(o.ok).then(ctx.cerrarModal).catch(function (e) { ctx.$("mOk").disabled = false; ctx.$("mErr").textContent = ctx.msgError(e); });
    });
};
ctx.modalNombreHoja = function (id) {
    var renombrar = !!id;
    ctx.abrirModal('<h2 id="mTitulo"></h2>' +
        '<label class="t" for="mNombreHoja">Nombre de la hoja</label><input type="text" id="mNombreHoja" autocomplete="off" placeholder="Ej: Juan Pérez">' +
        '<p class="hint">Se usa en la pestaña hasta que cargues el colaborador. Al guardar su nombre y apellido, la pestaña pasa a mostrar ese nombre.</p>' +
        '<p class="err-txt" id="mErr"></p><div class="m-acc"><button type="button" class="btn sec" data-cerrar>Cancelar</button><button type="button" class="btn prim" id="mOk">' + (renombrar ? "Guardar" : "Crear hoja") + '</button></div>');
    ctx.$("mTitulo").textContent = renombrar ? "Renombrar hoja" : "Nueva hoja · " + ctx.LOCALES[ctx.S.local].txt + " · " + ctx.CARPETAS[ctx.S.carpeta];
    if (renombrar)
        ctx.$("mNombreHoja").value = ctx.S.srv[id].nombreHoja || "";
    var ok = function () {
        var n = ctx.$("mNombreHoja").value.trim();
        if (!n) {
            ctx.$("mErr").textContent = "Escribí un nombre para la hoja.";
            return;
        }
        var rep = ctx.S.orden.some(function (o) { return o !== id && ctx.localDe(ctx.S.srv[o]) === ctx.S.local && (ctx.S.srv[o].nombreHoja || "").toLowerCase() === n.toLowerCase(); });
        if (rep) {
            ctx.$("mErr").textContent = "Ya hay una hoja con ese nombre en " + ctx.LOCALES[ctx.S.local].txt + ".";
            return;
        }
        ctx.$("mOk").disabled = true;
        if (renombrar) {
            ctx.S.db.doc("hojas/" + id).update({ nombreHoja: n }).then(function () {
                ctx.S.srv[id].nombreHoja = n;
                ctx.cerrarModal();
                ctx.pintarTodo();
                ctx.toast("Hoja renombrada con éxito");
            }).catch(function (e) { ctx.$("mOk").disabled = false; ctx.$("mErr").textContent = ctx.msgError(e); });
            return;
        }
        var ref = ctx.S.db.collection("hojas").doc(), datos = ctx.hojaVacia(n, ctx.S.local, ctx.S.carpeta);
        ref.set(datos).then(function () {
            ctx.S.srv[ref.id] = ctx.clon(datos);
            if (ctx.S.orden.indexOf(ref.id) === -1)
                ctx.S.orden.push(ref.id);
            ctx.S.activo = ref.id;
            ctx.S.ultimo[ctx.S.local + ":" + ctx.S.carpeta] = ref.id;
            ctx.guardarPref();
            ctx.cerrarModal();
            ctx.suscribirHistorial();
            ctx.pintarTodo();
            ctx.toast("Hoja creada con éxito");
            ctx.entrarEdicion();
        }).catch(function (e) { ctx.$("mOk").disabled = false; ctx.$("mErr").textContent = e && e.code === "quota_exceeded" ? "La planilla llegó a su límite de hojas." : ctx.msgError(e); });
    };
    scope.listen(ctx.$("mOk"), "click", ok);
    scope.listen(ctx.$("mNombreHoja"), "keydown", function (e) { if (e.key === "Enter")
        ok(); });
};
return () => {
ctx.modalCerrable = true;
scope.listen(ctx.$("overlay"), "click", function (e) { if (e.target === ctx.$("overlay") && ctx.modalCerrable)
    ctx.cerrarModal(); });
scope.listen(document, "keydown", function (e) { if (e.key === "Escape" && !ctx.$("overlay").hidden && ctx.modalCerrable)
    ctx.cerrarModal(); });
ctx.ACCIONES = { whatsapp: { preg: "enviarse por WhatsApp", sigue: "el envío" }, recibo: { preg: "descargarse e imprimirse", sigue: "la descarga del recibo" } };
/* ---------- Tono ---------- */
scope.listen(ctx.$("bTono"), "click", function () {
    var html = '<h2 id="mTitulo">Tono de la planilla</h2><p class="m-sub">' + (ctx.S.esDuena ? 'Se guarda para la planilla y también colorea los reportes.' : 'Cambia solo cómo ves la planilla en este dispositivo. Los reportes salen con los colores de la planilla.') + '</p>' +
        '<span class="t">Color</span><div class="tonos" role="radiogroup" aria-label="Color">';
    Object.keys(ctx.TONOS).forEach(function (k) { html += '<button type="button" class="tono" role="radio" data-tono="' + k + '"><span class="sw" style="background:' + ctx.TONOS[k].claro.band + '"></span>' + ctx.TONOS[k].txt + '</button>'; });
    html += '</div><span class="t">Modo</span><div class="segmento" role="radiogroup" aria-label="Modo">';
    Object.keys(ctx.MODOS).forEach(function (k) { html += '<button type="button" role="radio" data-modo="' + k + '">' + ctx.MODOS[k] + '</button>'; });
    html += '</div><div class="m-acc"><button type="button" class="btn prim" data-cerrar>Listo</button></div>';
    ctx.abrirModal(html);
    var marcar = function () {
        Array.prototype.forEach.call(ctx.$("modal").querySelectorAll("[data-tono]"), function (b) { b.setAttribute("aria-checked", b.getAttribute("data-tono") === ctx.S.tema.tono ? "true" : "false"); });
        Array.prototype.forEach.call(ctx.$("modal").querySelectorAll("[data-modo]"), function (b) { b.setAttribute("aria-checked", b.getAttribute("data-modo") === ctx.S.tema.modo ? "true" : "false"); });
    };
    marcar();
    Array.prototype.forEach.call(ctx.$("modal").querySelectorAll("[data-tono]"), function (b) { scope.listen(b, "click", function () { ctx.S.tema.tono = b.getAttribute("data-tono"); ctx.aplicarTema(); marcar(); ctx.guardarTema(); }); });
    Array.prototype.forEach.call(ctx.$("modal").querySelectorAll("[data-modo]"), function (b) { scope.listen(b, "click", function () { ctx.S.tema.modo = b.getAttribute("data-modo"); ctx.aplicarTema(); marcar(); ctx.guardarTema(); }); });
});
};
}
