// Preserved behavior from test-app; mounted and disposed by the React hooks.
export function registerPdfExport(scope, ctx) {
const { document, window } = scope;
ctx.fuentesListas = function () {
    if (!document.fonts || !document.fonts.load)
        return Promise.resolve();
    var p = Promise.all(['400 20px "IBM Plex Sans"', '700 20px "IBM Plex Sans"', '700 20px "Source Serif 4"'].map(function (f) { return document.fonts.load(f); })).catch(function () { });
    return Promise.race([p, ctx.esperar(2500)]);
};
ctx.crearImagen = function (h, nombre) {
    var lz = new ctx.LienzoDoc(6);
    var pre = Promise.resolve();
    return Promise.all([pre, ctx.fuentesListas()]).then(function () { ctx.crearPdf(h, nombre, lz); return lz.aBlob(); });
};
ctx.crearPdf = function (h, nombreColab, lienzo) {
    var img = !!lienzo, J = window.jspdf && window.jspdf.jsPDF;
    if (!img && !J)
        throw new Error("pdf");
    var tono = (ctx.TONOS[(ctx.S.temaPlanilla || ctx.S.tema).tono] || ctx.TONOS.marino).claro, tar = ctx.normTarifas(h.tarifas);
    var doc = img ? lienzo : new J({ unit: "mm", format: "a4" });
    var W = 210, H = 297, M = 20, A = W - 2 * M, band = ctx.rgb(tono.band), tinte = ctx.rgb(tono.tint);
    var tinta = [18, 28, 43], gris = [91, 103, 120], linea = [221, 227, 234], zebra = [248, 250, 252];
    var T = function (txt, x, y, o) { doc.text(String(txt == null ? "" : txt).replace(/—/g, "-"), x, y, o || {}); };
    doc.setFillColor.apply(doc, band);
    doc.rect(0, 0, W, 5, "F");
    var y = 20;
    doc.setTextColor.apply(doc, band);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    T("GESTION INTERNA", M, y);
    doc.setTextColor.apply(doc, tinta);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    var titleLines = doc.splitTextToSize(ctx.LOCALES[ctx.localDe(h)].txt, A * 0.56);
    titleLines.forEach(function (line, index) { T(line, M, y + 9 + index * 9); });
    var titleBottom = y + 9 + (titleLines.length - 1) * 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, tinta);
    T(ctx.CICLOS[ctx.cicloDe(h)], W - M, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor.apply(doc, gris);
    var periodLines = doc.splitTextToSize("Período: " + (ctx.periodoTxt(h) || "-"), A * 0.40);
    periodLines.forEach(function (line, index) { T(line, W - M, y + 6 + index * 4.6, { align: "right" }); });
    var dateY = y + 11 + (periodLines.length - 1) * 4.6;
    T("Fecha: " + (ctx.fechaTxt(h.fecha) || ctx.fechaTxt(ctx.hoyIso())), W - M, dateY, { align: "right" });
    y = Math.max(y + 18, titleBottom + 7, dateY + 7);
    doc.setDrawColor.apply(doc, linea);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, gris);
    T("DATOS DEL COLABORADOR", M, y);
    y += 4;
    var campo = function (x, yy, w, lbl, val, fuerte) {
        doc.setDrawColor.apply(doc, linea);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, yy, w, 14, 1.5, 1.5, "S");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, gris);
        T(lbl.toUpperCase(), x + 3.5, yy + 5);
        doc.setFont("helvetica", fuerte ? "bold" : "normal");
        doc.setFontSize(10.5);
        doc.setTextColor.apply(doc, tinta);
        T(val || "-", x + 3.5, yy + 10.6);
    };
    var mitad = (A - 4) / 2;
    campo(M, y, A, "Nombre y apellido", nombreColab, true);
    y += 17;
    campo(M, y, mitad, "Puesto", ctx.puestoTxt(h) + " · " + ctx.modalidadTxt(h).toLowerCase());
    campo(M + mitad + 4, y, mitad, "Período", ctx.periodoTxt(h));
    y += 17;
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, gris);
    T("DETALLE", M, y);
    y += 4;
    var c1 = 66, c2 = 32, c3 = 36, fh = 9, xC = M + c1 + c2 - 3.5, xV = M + c1 + c2 + c3 - 3.5, xI = W - M - 3.5;
    doc.setFillColor.apply(doc, tinte);
    doc.rect(M, y, A, fh, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, band);
    T("CONCEPTO", M + 3.5, y + 5.8);
    T("CANTIDAD", xC, y + 5.8, { align: "right" });
    T("VALOR UNIT.", xV, y + 5.8, { align: "right" });
    T("IMPORTE", xI, y + 5.8, { align: "right" });
    y += fh;
    var i = 0;
    ctx.ITEMS.forEach(function (it0) {
        if (!ctx.activo(h, it0))
            return;
        var it = ctx.defItem(h, it0), v = (h.items && h.items[it.k]) || {}, t = tar[it.k];
        if (i % 2 === 1) {
            doc.setFillColor.apply(doc, zebra);
            doc.rect(M, y, A, fh, "F");
        }
        doc.setDrawColor.apply(doc, linea);
        doc.line(M, y + fh, W - M, y + fh);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, tinta);
        var just = it.k === "aus" && ctx.ausJustificado(h);
        T(it.txt + (just ? " (justificado)" : (it.resta ? " (descuento)" : "")), M + 3.5, y + 6);
        T(ctx.cantTxt(it.tipo, v.c), xC, y + 6, { align: "right" });
        T(just || it.tipo === "monto" || t == null ? "-" : ctx.pesos(t), xV, y + 6, { align: "right" });
        if (just) {
            doc.setTextColor.apply(doc, gris);
            T("Sin descuento", xI, y + 6, { align: "right" });
        }
        else {
            if (it.resta && v.i)
                doc.setTextColor(179, 38, 30);
            T(ctx.importeTxt(it, v.i, "-", "- "), xI, y + 6, { align: "right" });
        }
        doc.setTextColor.apply(doc, tinta);
        y += fh;
        i++;
    });
    y += 4;
    doc.setFillColor.apply(doc, band);
    doc.roundedRect(M, y, A, 13, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    T("TOTAL", M + 3.5, y + 8.2);
    T(ctx.cantidadTotalTxt(h), xC, y + 8.2, { align: "right" });
    doc.setFontSize(13);
    T(ctx.pesos(ctx.totalDe(h)), W - M - 4, y + 8.6, { align: "right" });
    y += 22;
    if (h.obs) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor.apply(doc, gris);
        T("OBSERVACIONES", M, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor.apply(doc, tinta);
        var lineas = doc.splitTextToSize(String(h.obs).replace(/—/g, "-"), A), max = img ? 60 : Math.max(1, Math.floor((H - 32 - y) / 4.6));
        if (lineas.length > max) {
            lineas = lineas.slice(0, max);
            lineas[max - 1] = lineas[max - 1].replace(/\s*\S*$/, "") + "...";
        }
        lineas.forEach(function (ln) { doc.text(ln, M, y); y += 4.6; });
    }
    var np = doc.getNumberOfPages ? doc.getNumberOfPages() : 1, gen = (img && lienzo.pie) || ("Documento generado el " + ctx.fechaHoraTxt(new Date().toISOString()) + " · GESTLOK");
    if (img) {
        var yp = y + 10;
        doc.setDrawColor.apply(doc, linea);
        doc.setLineWidth(0.3);
        doc.line(M, yp, W - M, yp);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, gris);
        T(gen, M, yp + 5);
        doc.alto = yp + 10;
        return doc;
    }
    for (var pg = 1; pg <= np; pg++) {
        if (doc.setPage)
            doc.setPage(pg);
        doc.setDrawColor.apply(doc, linea);
        doc.setLineWidth(0.3);
        doc.line(M, H - 16, W - M, H - 16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, gris);
        T(gen, M, H - 11);
        T("Página " + pg + " de " + np, W - M, H - 11, { align: "right" });
    }
    return doc.output("blob");
};
ctx.prepararEnvio = function (h, nombre, tel, mensaje) {
    var per = ctx.periodoTxt(h).replace(/\//g, "-"), base = "Reporte " + ctx.LOCALES[ctx.localDe(h)].txt + " - " + nombre + (per ? " - " + per : " - " + ctx.hoyIso());
    return { archivoImg: base + ".png", archivoPdf: base + ".pdf", img: null, msg: mensaje || "", wa: "https://wa.me/" + tel + (mensaje ? "?text=" + encodeURIComponent(mensaje) : "") };
};
ctx.registrarEnvio = function (id, nombre, tel) {
    var h = ctx.S.srv[id];
    return window.reportServices.recordWhatsapp(id, { nombre: nombre, tel: tel }, h && h.actualizado || null);
};
ctx.guardarArchivo = function (data, archivo, btn, txtEl, okTxt) {
    if (!ctx.S.downloads) {
        ctx.toast("Esta vista no permite guardar archivos. Abrí la planilla desde claude.ai.", "err");
        return;
    }
    btn.disabled = true;
    ctx.S.downloads.save({ filename: archivo, data: data }).then(function () {
        if (txtEl && okTxt)
            txtEl.textContent = okTxt;
        ctx.toast(/\.pdf$/i.test(archivo) ? "PDF guardado con éxito" : "Imagen guardada con éxito");
    }).catch(function (e) {
        var c = e && e.code, msg = c === "declined" ? "No se guardó. Podés intentarlo de nuevo." : (c === "rate_limited" ? "Ya hay una descarga abierta. Esperá unos segundos." : "No se pudo guardar el archivo en esta vista.");
        if (txtEl)
            txtEl.textContent = msg;
        else
            ctx.toast(msg, "err");
    }).then(function () { btn.disabled = false; });
};
ctx.bajarPdfDe = function (h, nombre, archivo, btn) {
    var pdf = null;
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
    ctx.guardarArchivo(pdf, archivo, btn, null, "");
};
ctx.esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
ctx.esTactil = function () { try {
    return window.matchMedia("(pointer: coarse)").matches;
}
catch (e) {
    return false;
} };
ctx.archivoImagen = function (env) { try {
    return new File([env.img], env.archivoImg, { type: "image/png" });
}
catch (e) {
    return null;
} };
ctx.puedeCompartir = function (file) { try {
    return !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
}
catch (e) {
    return false;
} };
ctx.puedeCopiarImagen = function () { return !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem); };
ctx.accionesEnvio = function (cont, env, nombre, h) {
    var f = env.img ? ctx.archivoImagen(env) : null, comp = !!f && ctx.esTactil() && ctx.puedeCompartir(f), copia = !!env.img && ctx.puedeCopiarImagen(), bajar = !!ctx.S.downloads, directo = comp || copia;
    var html = '';
    if (comp)
        html += '<button type="button" class="btn wa grande" data-acc="compartir">Enviar imagen por WhatsApp</button><small class="acc-ayuda">Se abre el menú Compartir con la imagen: elegí WhatsApp y después a ' + ctx.esc(nombre) + '. La imagen no se guarda en tu teléfono.</small>';
    if (copia)
        html += '<button type="button" class="btn ' + (comp ? 'sec' : 'wa grande') + '" data-acc="copiar"' + (comp ? ' hidden' : '') + '>Copiar imagen y abrir WhatsApp</button>' +
            (comp ? '' : '<small class="acc-ayuda">Se abre el chat de ' + ctx.esc(nombre) + ' con el saludo escrito. Pegá la imagen con Ctrl+V (⌘+V en Mac) y enviá. La imagen no se guarda en tu computadora.</small>');
    if (!directo) {
        html += '<ol class="pasos">' + (bajar && env.img ? '<li><button type="button" class="btn prim" data-acc="guardar">Guardar la imagen</button><small>En el celular podés mandarla a WhatsApp desde Compartir.</small></li>' : '') +
            '<li><a class="btn wa" data-acc="chat" target="_blank" rel="noopener">Abrir el chat de WhatsApp</a><small>' + (env.img ? 'Adjuntá la imagen desde la galería o los archivos.' : 'Se abre el chat del colaborador.') + '</small></li></ol>';
    }
    html += '<p class="acc-estado" data-est hidden></p>';
    if (env.onShared) html += '<button type="button" class="btn sec" data-acc="confirmar">Confirmar envío realizado</button><small>Usá esta opción si compartiste el archivo manualmente.</small>';
    if (!env.img)
        html += '<p class="err-txt">No se pudo armar la imagen en este dispositivo.' + (bajar ? ' Podés descargar el reporte en PDF.' : '') + '</p>';
    if (!bajar)
        html += '<p class="hint">Esta vista no permite guardar archivos. Abrí la aplicación en un navegador compatible con descargas.</p>';
    html += '<div class="acc-links">' + (directo ? '<a class="link" data-acc="chat" target="_blank" rel="noopener">Abrir solo el chat</a>' : '') +
        (directo && bajar ? '<button type="button" class="link" data-acc="guardar" hidden>Guardar la imagen</button>' : '') +
        (bajar ? '<button type="button" class="link" data-acc="pdf">Descargar en PDF</button>' : '') + '</div>';
    cont.innerHTML = html;
    var q = function (a) { return cont.querySelector('[data-acc="' + a + '"]'); }, est = cont.querySelector("[data-est]");
    var aviso = function (t, tipo) { est.hidden = false; est.textContent = t; est.className = "acc-estado" + (tipo ? " " + tipo : ""); };
    var recording = null, recorded = false;
    var registrar = function () {
        if (recorded || !env.onShared) return Promise.resolve();
        if (recording) return recording;
        recording = env.onShared().then(function () {
            recorded = true;
            if (q("confirmar")) { q("confirmar").disabled = true; q("confirmar").textContent = "Enviado · guardado en el historial"; }
            ctx.pintarTodo();
        }).catch(function (error) {
            aviso("Se abrió el envío, pero no pudimos registrar el historial. Usá Confirmar envío realizado para reintentar. " + ctx.msgError(error), "err");
        }).finally(function () { recording = null; });
        return recording;
    };
    if (q("confirmar")) scope.listen(q("confirmar"), "click", registrar);
    var ultimoRecurso = function () { Array.prototype.forEach.call(cont.querySelectorAll('[data-acc="guardar"]'), function (b) { b.hidden = false; }); };
    Array.prototype.forEach.call(cont.querySelectorAll('[data-acc="chat"]'), function (a) { a.href = env.wa; });
    if (q("compartir"))
        scope.listen(q("compartir"), "click", function () {
            var data = { files: [f] };
            if (env.msg) {
                try {
                    if (navigator.canShare({ files: [f], text: env.msg }))
                        data = { files: [f], text: env.msg };
                }
                catch (e) { }
            }
            navigator.share(data).then(function () { aviso("Listo. Si elegiste WhatsApp y a " + nombre + ", el reporte ya fue enviado.", "ok"); return registrar(); }, function (e) {
                if (e && e.name === "AbortError") {
                    aviso("Cancelaste el envío. Podés intentarlo de nuevo.");
                    return;
                }
                if (q("copiar")) {
                    q("copiar").hidden = false;
                    aviso("Este dispositivo no permitió compartir desde acá. Probá con “Copiar imagen y abrir WhatsApp”.", "err");
                }
                else {
                    aviso("Este dispositivo no permitió compartir desde acá. Como último recurso podés guardar la imagen y adjuntarla en el chat.", "err");
                    ultimoRecurso();
                }
            });
        });
    if (q("copiar"))
        scope.listen(q("copiar"), "click", function () {
            var b = this, p;
            b.disabled = true;
            try {
                p = navigator.clipboard.write([new ClipboardItem({ "image/png": env.img })]);
            }
            catch (e) {
                p = Promise.reject(e);
            }
            p.then(function () {
                var w = null;
                try {
                    w = window.open(env.wa, "_blank", "noopener,noreferrer");
                    if (w)
                        w.opener = null;
                }
                catch (e) { }
                aviso(w ? "Imagen copiada ✓ En el chat de WhatsApp pegala con Ctrl+V (⌘+V en Mac) y enviá." : "Imagen copiada ✓ Tocá “Abrir solo el chat” y pegala con Ctrl+V (⌘+V en Mac).", "ok");
                if (env.onShared) aviso("Imagen copiada. Pegala en WhatsApp y enviala. Después pulsá Confirmar envío realizado para guardarlo en el historial.", "ok");
            }, function () { aviso("No se pudo copiar la imagen desde esta vista. Como último recurso podés guardar la imagen y adjuntarla en el chat.", "err"); ultimoRecurso(); }).then(function () { b.disabled = false; });
        });
    Array.prototype.forEach.call(cont.querySelectorAll('[data-acc="guardar"]'), function (b) {
        scope.listen(b, "click", function () { ctx.guardarArchivo(env.img, env.archivoImg, b, null, ""); });
    });
    if (q("pdf"))
        scope.listen(q("pdf"), "click", function () { ctx.bajarPdfDe(h, nombre, env.archivoPdf, q("pdf")); });
};
return () => {
scope.listen(ctx.$("bExportar"), "click", function () { ctx.conGuardado(ctx.exportarDatos); });
};
}
