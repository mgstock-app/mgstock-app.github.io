// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerSignature(scope, ctx) {
const { document, window } = scope;
ctx.prepararCanvas = function () {
    var c = ctx.$("firmaCanvas"), r = ctx.$("firmaBox").getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (!w || !h)
        return;
    if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        ctx.F.trazo = false;
        ctx.botonesFirma();
    }
    var ctx = c.getContext("2d");
    ctx.lineWidth = 2.4 * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.F.ctx = ctx;
};
ctx.limpiarCanvas = function () { var c = ctx.$("firmaCanvas"); if (ctx.F.ctx)
    ctx.F.ctx.clearRect(0, 0, c.width, c.height); ctx.F.trazo = false; ctx.botonesFirma(); };
ctx.botonesFirma = function () { ctx.$("bFirmaGuardar").disabled = !ctx.F.trazo; };
ctx.posFirma = function (e) { var c = ctx.$("firmaCanvas"), r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
ctx.iniciarFirma = function () {
    var c = ctx.$("firmaCanvas");
    scope.listen(c, "pointerdown", function (e) {
        if (!ctx.F.activa)
            return;
        e.preventDefault();
        ctx.prepararCanvas();
        if (!ctx.F.ctx)
            return;
        try {
            c.setPointerCapture(e.pointerId);
        }
        catch (er) { }
        ctx.F.dibujando = true;
        var p = ctx.posFirma(e);
        ctx.F.ultimo = p;
        ctx.F.ctx.beginPath();
        ctx.F.ctx.moveTo(p.x, p.y);
        ctx.F.ctx.lineTo(p.x + 0.5, p.y + 0.5);
        ctx.F.ctx.stroke();
    });
    scope.listen(c, "pointermove", function (e) {
        if (!ctx.F.dibujando)
            return;
        e.preventDefault();
        var p = ctx.posFirma(e);
        ctx.F.ctx.beginPath();
        ctx.F.ctx.moveTo(ctx.F.ultimo.x, ctx.F.ultimo.y);
        ctx.F.ctx.lineTo(p.x, p.y);
        ctx.F.ctx.stroke();
        ctx.F.ultimo = p;
        if (!ctx.F.trazo) {
            ctx.F.trazo = true;
            ctx.botonesFirma();
        }
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { scope.listen(c, ev, function () { ctx.F.dibujando = false; }); });
    scope.listen(ctx.$("bFirmaBorrar"), "click", ctx.limpiarCanvas);
    scope.listen(ctx.$("bFirmaRehacer"), "click", function () { ctx.F.rehacer = true; ctx.limpiarCanvas(); ctx.pintarValores(); });
    scope.listen(ctx.$("bIrFirma"), "click", function () { ctx.$("secRecibo").scrollIntoView({ behavior: "smooth", block: "start" }); });
    scope.listen(ctx.$("bFirmaGuardar"), "click", function () {
        var id = ctx.S.activo, h = ctx.S.srv[id];
        if (!h || !ctx.F.trazo) {
            ctx.toast("El colaborador tiene que firmar dentro del recuadro.", "err");
            return;
        }
        var w = 600, alto = Math.max(1, Math.round(600 * c.height / c.width)), o = document.createElement("canvas");
        o.width = w;
        o.height = alto;
        var x = o.getContext("2d");
        x.fillStyle = "#FFFFFF";
        x.fillRect(0, 0, w, alto);
        x.drawImage(c, 0, 0, w, alto);
        var f = { img: o.toDataURL("image/png"), fecha: new Date().toISOString(), w: w, h: alto };
        ctx.$("bFirmaGuardar").disabled = true;
        ctx.S.db.doc("hojas/" + id).update({ firma: f }).then(function () {
            h.firma = f;
            ctx.F.rehacer = false;
            ctx.limpiarCanvas();
            ctx.pintarTodo();
            ctx.toast("Firma guardada con éxito");
        }).catch(function (e) { ctx.botonesFirma(); ctx.toast(ctx.msgError(e), "err"); });
    });
    scope.listen(window, "resize", function () { if (!ctx.$("secRecibo").hidden && !ctx.F.trazo)
        ctx.prepararCanvas(); });
};
ctx.textoRecibo = function (h) {
    var t = ctx.totalDe(h), per = ctx.periodoTxt(h);
    var cuando = per ? (ctx.cicloDe(h) === "semanal" ? " correspondiente a la " + per.charAt(0).toLowerCase() + per.slice(1) : " correspondiente a " + per.toLowerCase()) : "";
    return "Recibí de " + ctx.LOCALES[ctx.localDe(h)].txt + " la suma de " + ctx.pesos(t) + " (pesos " + ctx.montoEnLetras(t) + ") en efectivo, en concepto de " + ctx.CICLOS[ctx.cicloDe(h)].toLowerCase() + cuando + ", de total conformidad.";
};
ctx.pintarRecibo = function (h) {
    var s = ctx.S.srv[ctx.S.activo] || {}, f = s.firma, vig = ctx.firmaVigente(s), ed = ctx.S.editando, datos = ctx.tieneDatos(s);
    ctx.$("reciboTxt").textContent = ctx.textoRecibo(h);
    ctx.$("firmaAcl").textContent = "Aclaración: " + (h.nombre || "sin nombre cargado");
    var conImg = !!(f && f.img) && !ctx.F.rehacer;
    ctx.$("firmaImg").hidden = !conImg;
    if (conImg && ctx.$("firmaImg").getAttribute("src") !== f.img)
        ctx.$("firmaImg").setAttribute("src", f.img);
    ctx.$("firmaCanvas").hidden = conImg;
    ctx.F.activa = !conImg && !ed && datos && !ctx.S.soloLectura;
    ctx.$("firmaBox").classList.toggle("inactiva", !conImg && !ctx.F.activa);
    ctx.$("firmaFecha").textContent = conImg && f.fecha ? "Firmado el " + ctx.fechaHoraTxt(f.fecha) : "";
    ctx.$("firmaAviso").hidden = !(conImg && !vig);
    ctx.$("firmaAviso").textContent = "Los datos de la hoja cambiaron después de esta firma. Pedile al colaborador que firme de nuevo.";
    ctx.$("firmaAyuda").textContent = ed ? "Guardá los cambios para habilitar la firma." : (!datos ? "Cargá el detalle de la hoja para habilitar la firma." : (conImg ? "" : "El colaborador firma con el dedo dentro del recuadro y después tocás Guardar firma. También podés descargar el recibo e imprimirlo."));
    ctx.$("bFirmaBorrar").hidden = ctx.$("bFirmaGuardar").hidden = conImg || !ctx.F.activa;
    ctx.$("bFirmaRehacer").hidden = !conImg || ed || ctx.S.soloLectura || !datos;
    ctx.botonesFirma();
    if (!conImg)
        requestAnimationFrame(ctx.prepararCanvas);
    ctx.$("dFirma").textContent = vig ? "Firmado el " + ctx.fechaHoraTxt(f.fecha) : (f && f.img ? "Hay que firmar de nuevo" : "Pendiente");
    ctx.$("dRecibo").textContent = s.ultimaExport ? ctx.fechaHoraTxt(s.ultimaExport) : "Nunca";
};
ctx.descargarRecibo = function () {
    var id = ctx.S.activo, h = ctx.S.srv[id];
    if (!h)
        return;
    if (!ctx.S.downloads) {
        ctx.toast("Esta vista no permite descargar archivos. Abrí la planilla desde claude.ai.", "err");
        return;
    }
    var nombre = h.nombre || h.nombreHoja || "", pdf = null;
    try {
        pdf = ctx.crearPdf(h, nombre);
    }
    catch (e) {
        pdf = null;
    }
    if (!pdf) {
        ctx.toast("No se pudo armar el PDF en este dispositivo.", "err");
        return;
    }
    var per = ctx.periodoTxt(h).replace(/\//g, "-");
    var archivo = "Recibo " + ctx.LOCALES[ctx.localDe(h)].txt + " - " + nombre + (per ? " - " + per : " - " + ctx.hoyIso()) + ".pdf";
    ctx.confirmarReporte(h, "recibo", function () {
        var ahora = new Date().toISOString();
        return ctx.S.db.doc("hojas/" + id).update({ ultimaExport: ahora }).then(function () {
            h.ultimaExport = ahora;
            return ctx.registrarHistorialDe(id, "Recibo en efectivo" + (ctx.firmaVigente(h) ? " (firmado en pantalla)" : " (para firmar en papel)"));
        }).then(function () {
            ctx.modalCerrable = true;
            ctx.cerrarModal();
            ctx.pintarTodo();
            ctx.$("bRecibo").disabled = true;
            return ctx.S.downloads.save({ filename: archivo, data: pdf }).then(function () { ctx.toast("Guardado en el historial y recibo descargado"); }, function (e) {
                var c = e && e.code;
                ctx.toast(c === "declined" ? "Quedó guardado en el historial; el recibo no se descargó." : (c === "rate_limited" ? "Quedó guardado en el historial. Ya hay una descarga abierta: esperá unos segundos y descargalo de nuevo." : "Quedó guardado en el historial, pero el recibo no se pudo descargar en esta vista."), c === "declined" ? undefined : "err");
            }).then(function () { ctx.$("bRecibo").disabled = false; });
        });
    });
};
ctx.cambiarEstadoColab = function (est) {
    var id = ctx.S.activo, h = ctx.S.srv[id];
    if (!h || ctx.S.soloLectura || !ctx.S.db || ctx.S.cambiandoActivo || !ctx.ESTADOS_COLAB[est])
        return;
    if (ctx.estadoColab(h) === est)
        return;
    var hoy = ctx.hoyIso(), patch = { estadoColab: est, estadoDesde: est === "activo" ? null : hoy, inactivo: est === "inactivo", inactivoDesde: est === "inactivo" ? hoy : null };
    ctx.S.cambiandoActivo = true;
    ctx.pintarValores();
    ctx.S.db.doc("hojas/" + id).update(patch).then(function () {
        Object.keys(patch).forEach(function (k) { h[k] = patch[k]; });
        ctx.toast(ctx.tituloHoja(h) + " quedó como " + ctx.ESTADOS_COLAB[est].toLowerCase());
    }, function (e) { ctx.toast(ctx.msgError(e), "err"); }).then(function () { ctx.S.cambiandoActivo = false; ctx.pintarTodo(); });
};
ctx.copiarAlias = function (alias) {
    alias = String(alias || "").trim();
    if (!alias)
        return;
    var falla = function () { ctx.toast("No se pudo copiar. Alias: " + alias, "err"); };
    try {
        navigator.clipboard.writeText(alias).then(function () { ctx.toast("Alias copiado: " + alias); }, falla);
    }
    catch (e) {
        falla();
    }
};
ctx.pintarValores = function () {
    var h = ctx.vista();
    if (!h)
        return;
    var ed = ctx.S.editando, enc = ctx.puestoDe(h) === "encargado", turno = ctx.esTurno(h), sem = ctx.cicloDe(h) === "semanal", tar = ctx.normTarifas(h.tarifas);
    ctx.$("docEyebrow").textContent = "GESTLOK · " + ctx.LOCALES[ctx.localDe(h)].txt;
    ctx.$("docTitulo").textContent = ctx.CICLOS[ctx.cicloDe(h)];
    ctx.$("docPeriodo").textContent = ctx.periodoTxt(h) || "Sin completar";
    ctx.setVal("fNombre", h.nombre || "");
    ctx.$("fFecha").textContent = h.fecha ? ctx.fechaTxt(h.fecha) : "Se completa al guardar";
    ctx.setVal("fMes", h.mes || "");
    ctx.setVal("fAnio", h.anio ? String(h.anio) : "");
    if (ctx.cicloDe(h) === "semanal")
        ctx.pintarSemanas(h, ed);
    ctx.setVal("fObs", h.obs || "");
    ctx.setVal("fTel", ed ? (h._tel || "") : (h.contacto && h.contacto.tel ? ctx.telTxt(h.contacto.tel) : ""));
    ctx.$("fTel").placeholder = ed ? "11 1234 5678" : "Sin cargar";
    ctx.setVal("fAlias", h.alias || "");
    ctx.$("fAlias").placeholder = ed ? "Ej: juan.perez.mp" : "Sin cargar";
    ctx.$("bCopiarAlias").hidden = ed || !(h.alias && String(h.alias).trim());
    var efe = ctx.esEfectivo(h);
    ctx.$("bPagoTr").setAttribute("aria-checked", efe ? "false" : "true");
    ctx.$("bPagoEf").setAttribute("aria-checked", efe ? "true" : "false");
    ctx.$("fldAlias").hidden = efe;
    ctx.$("secRecibo").hidden = !efe;
    ctx.$("panelEfe").hidden = !efe;
    ctx.$("panelWa").hidden = false;
    ctx.$("fObs").placeholder = ed ? "Ej: Incluye 2 horas extra del sábado 11." : "Sin observaciones";
    ctx.$("mesVacio").textContent = ed ? "Elegir mes" : "Sin completar";
    ctx.$("fAnio").options[0].textContent = ed ? "Año" : "";
    ctx.$("fNombre").placeholder = ed ? "Nombre completo" : "Sin completar";
    ctx.$("fPuesto").value = enc ? "encargado" : "staff";
    ctx.$("fldCobra").hidden = false;
    ctx.$("fldCobraStaff").hidden = true;
    ctx.$("fldMes").hidden = sem;
    ctx.$("fldSemana").hidden = !sem;
    ctx.$("ayudaDetalle").hidden = !ed;
    ctx.$("bPorHoras").setAttribute("aria-checked", turno ? "false" : "true");
    ctx.$("bPorTurnos").setAttribute("aria-checked", turno ? "true" : "false");
    ["bPagoTr", "bPagoEf", "fNombre", "fTel", "fAlias", "fMes", "fAnio", "fSemana", "fPuesto", "bPorHoras", "bPorTurnos", "fObs"].forEach(function (id) { ctx.$(id).disabled = !ed; });
    ctx.ITEMS.forEach(function (it0) {
        var it = ctx.defItem(h, it0), v = (h.items && h.items[it.k]) || {}, ii = ctx.$("i_" + it.k), on = ctx.activo(h, it0);
        if (!it0.opcional)
            ctx.$("lbl_" + it.k).textContent = it.txt;
        if (it.tipo !== "monto") {
            var ic = ctx.$("c_" + it.k), iv = ctx.$("v_" + it.k), t = ctx.tarifaDe(h, it.k), lig = ctx.LIGADAS.indexOf(it.k) > -1;
            ctx.$("u_" + it.k).textContent = it.tipo === "horas" ? "hs" : (it.tipo === "turnos" ? "turnos" : "días");
            ctx.$("uv_" + it.k).textContent = ctx.porUnidad(it.tipo);
            ic.inputMode = it.tipo === "horas" ? "text" : "numeric";
            ic.title = it.tipo === "horas" ? "Horas:minutos, por ejemplo 145:50. También admite horas decimales." : "Cantidad entera";
            if (document.activeElement !== ic && !ctx.errores["c" + it.k])
                ic.value = v.c == null ? "" : (it.tipo === "horas" ? ctx.formatHours(v.c) : ctx.fmtEntero.format(v.c));
            var just = it.k === "aus" && ctx.ausJustificado(h);
            if (document.activeElement !== iv && !ctx.errores["v" + it.k])
                iv.value = (t == null || just) ? "" : ctx.fmtImporte.format(t);
            ic.placeholder = ed ? "0" : "—";
            iv.placeholder = just ? "No aplica" : (ed ? (lig ? "= trabajado" : "Opcional") : "—");
            ic.disabled = !ed || !on;
            iv.disabled = !ed || !on || lig || just;
            if (it.k === "aus") {
                ctx.$("cv_aus").classList.toggle("ligado", ed && just);
                ctx.$("ci_aus").classList.toggle("resta", !just);
                ctx.$("cv_aus").querySelector(".pre").style.visibility = ctx.$("ci_aus").querySelector(".pre").style.visibility = just ? "hidden" : "";
            }
            if (lig)
                ctx.$("cv_" + it.k).classList.toggle("ligado", ed);
            if (lig)
                ctx.$("cv_" + it.k).title = "Mismo valor que " + (turno ? "el turno trabajado" : "la hora trabajada") + ". Se carga en la fila de arriba.";
            ctx.$("ci_" + it.k).classList.toggle("auto", ed && t != null);
        }
        if (document.activeElement !== ii && !ctx.errores["i" + it.k])
            ii.value = v.i == null ? "" : ctx.fmtImporte.format(v.i);
        var sinDesc = it.k === "aus" && ctx.ausJustificado(h);
        ii.placeholder = sinDesc ? "Sin descuento" : (ed ? "0,00" : "—");
        ii.disabled = !ed || !on || sinDesc;
        if (it0.opcional) {
            ctx.$("sw_" + it.k).setAttribute("aria-checked", on ? "true" : "false");
            ctx.$("sw_" + it.k).disabled = !ed;
            ctx.$("fila_" + it.k).classList.toggle("apagada", !on);
            ctx.$("opc_" + it.k).textContent = sinDesc && on ? "Justificado · no descuenta" : ctx.OPCIONAL_TXT[it.k][on ? 0 : 1];
            if (it.k === "aus") {
                ctx.$("opc_aus").classList.toggle("resta", on && !sinDesc);
                ctx.$("ljAus").hidden = !on;
                ctx.$("fJust").checked = sinDesc;
                ctx.$("fJust").disabled = !ed;
                ctx.$("ljAus").classList.toggle("dis", !ed);
            }
        }
    });
    ctx.$("tTotal").textContent = ctx.pesos(ctx.totalDe(h));
    ctx.$("tCantidadTotal").textContent = ctx.cantidadTotalTxt(h);
    var s = ctx.S.srv[ctx.S.activo] || {}, c = s.contacto;
    ctx.$("dContacto").textContent = c && c.tel ? ctx.telTxt(c.tel) : "Sin cargar";
    ctx.$("bOlvidar").hidden = !(c && c.tel) || ctx.S.soloLectura;
    ctx.$("dUltima").textContent = s.ultimaExport ? ctx.fechaHoraTxt(s.ultimaExport) : "Nunca";
    ["bExportar", "bRecibo", "bLimpiar", "bRenombrar", "bEliminar"].forEach(function (id) { ctx.$(id).disabled = (id === 'bEliminar' && window.REPORT_PERMISSIONS ? !window.REPORT_PERMISSIONS.allowed('delete_reports') : ctx.S.soloLectura) || ctx.S.guardando; });
    var ro = ctx.S.soloLectura;
    ctx.$("panelPeriodo").hidden = ctx.$("bExportar").hidden = ctx.$("bRecibo").hidden = ctx.$("bIrFirma").hidden = ro;
    ctx.$("panelNota").hidden = ctx.S.esDuena;
    ctx.$("bRenombrar").hidden = !!ctx.nombreColab(s) || ro;
    ctx.$("bEliminar").hidden = !ctx.S.esDuena;
    ctx.$("panelHoja").hidden = ctx.$("bRenombrar").hidden && ctx.$("bEliminar").hidden;
    var ec = ctx.estadoColab(s), desde = s.estadoDesde || s.inactivoDesde;
    ["activo", "refuerzo", "descanso", "inactivo"].forEach(function (e) { var bt = ctx.$("b" + e.charAt(0).toUpperCase() + e.slice(1)); bt.setAttribute("aria-checked", ec === e ? "true" : "false"); bt.disabled = ctx.S.soloLectura || !!ctx.S.cambiandoActivo; });
    ctx.$("dActivo").textContent = ec === "inactivo" ? ("Inactivo" + (desde ? " desde el " + ctx.fechaTxt(desde) : "") + ": renunció. Punto rojo en la pestaña. No aparece en los reportes.") :
        ec === "refuerzo" ? ("Refuerzo" + (desde ? " desde el " + ctx.fechaTxt(desde) : "") + ": trabaja de forma temporal (días o semanas). Punto amarillo en la pestaña. No aparece en los reportes.") :
            (ctx.S.soloLectura ? "Punto verde en la pestaña." : "Punto verde en la pestaña. Refuerzo (amarillo) si trabaja de forma temporal; Inactivo (rojo) si renunció. No aparece en los reportes.");
    if (efe)
        ctx.pintarRecibo(h);
    ctx.pintarBarra();
};
return () => {
ctx.F = { ctx: null, dibujando: false, trazo: false, activa: false, rehacer: false, ultimo: null };
scope.listen(ctx.$("bRecibo"), "click", function () { ctx.conGuardado(ctx.descargarRecibo); });
scope.listen(ctx.$("bActivo"), "click", function () { ctx.cambiarEstadoColab("activo"); });
scope.listen(ctx.$("bRefuerzo"), "click", function () { ctx.cambiarEstadoColab("refuerzo"); });
scope.listen(ctx.$("bDescanso"), "click", function () { ctx.cambiarEstadoColab("descanso"); });
scope.listen(ctx.$("bInactivo"), "click", function () { ctx.cambiarEstadoColab("inactivo"); });
};
}
