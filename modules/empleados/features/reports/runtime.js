import { registerPayroll } from './payroll.js';
import { registerNavigation } from './navigation.js';
import { registerEditing } from './editing.js';
import { registerSignature } from './signature.js';
import { registerHistoryAndDialogs } from './history-and-dialogs.js';
import { registerPeriodAndCanvas } from './period-and-canvas.js';
import { registerPdfExport } from './pdf-export.js';
import { registerSharingAndBackups } from './sharing-and-backups.js';
import { registerCloudBackups } from './cloud-backups.js';
import { registerBootstrap } from './bootstrap.js';
export function mountReport(scope) {
const ctx = {};
const initializers = [registerPayroll(scope, ctx), registerNavigation(scope, ctx), registerEditing(scope, ctx), registerSignature(scope, ctx), registerHistoryAndDialogs(scope, ctx), registerPeriodAndCanvas(scope, ctx), registerPdfExport(scope, ctx), registerSharingAndBackups(scope, ctx), registerCloudBackups(scope, ctx), registerBootstrap(scope, ctx)];
for (const initialize of initializers) initialize();
return {
    renderImage: (data, name) => ctx.crearImagen(data, name),
    deliverySaved: (id, data) => { ctx.S.srv[id] = ctx.clon(data); if (ctx.S.activo === id) ctx.suscribirHistorial(); ctx.pintarTodo(); },
    // The dashboard delegates all navigation and creation to the existing editor.
    openSheet: (localId, id) => {
        const sheet = ctx.S.srv[id];
        if (!ctx.S.cargado || !ctx.S.db || !ctx.LOCALES[localId] || !sheet || ctx.localDe(sheet) !== localId) return false;
        ctx.salirSiHaceFalta(function () {
            ctx.S.pantalla = "local";
            ctx.S.local = localId;
            ctx.S.carpeta = ctx.puestoDe(sheet);
            ctx.S.activo = id;
            ctx.S.ultimo[localId + ":" + ctx.S.carpeta] = id;
            ctx.guardarPref();
            ctx.suscribirHistorial();
            ctx.pintarTodo();
            window.scrollTo(0, 0);
        });
        return true;
    },
    // Same private PDF generator already used by the current employee sheets.
    downloadPdf: async (localId, id) => {
        const h = ctx.S.srv[id];
        if (!h || ctx.localDe(h) !== localId || !ctx.S.downloads || !ctx.S.cargado ||
            !window.REPORT_PERMISSIONS?.allowed('export_reports')) {
            throw new Error("El recibo no está disponible o no tenés permiso para descargarlo.");
        }
        const nombre = ctx.nombreColab(h) || ctx.tituloHoja(h);
        const archivo = ("Recibo " + nombre + " " + ctx.periodoTxt(h) + ".pdf")
            .replace(/[\\/:*?"<>|]/g, "-").slice(0, 180);
        await ctx.S.downloads.save({ filename: archivo, data: ctx.crearPdf(h, nombre) });
    },
    // Opens the existing WhatsApp flow, including confirmation and private history.
    shareWhatsapp: (localId, id) => {
        const h = ctx.S.srv[id];
        if (!h || ctx.localDe(h) !== localId || !ctx.S.cargado || !ctx.S.db ||
            ctx.S.soloLectura || ctx.S.editando || ctx.S.guardando ||
            !window.REPORT_PERMISSIONS?.allowed('export_reports')) return false;
        ctx.S.pantalla = "local";
        ctx.S.local = localId;
        ctx.S.carpeta = ctx.puestoDe(h);
        ctx.S.activo = id;
        ctx.suscribirHistorial();
        ctx.pintarTodo();
        setTimeout(function () {
            if (ctx.S.activo === id) ctx.$("bExportar")?.click();
        }, 0);
        return true;
    },
    addSheet: (localId) => {
        if (!ctx.S.cargado || !ctx.S.db || ctx.S.soloLectura || !ctx.LOCALES[localId]) return false;
        ctx.salirSiHaceFalta(function () {
            ctx.S.pantalla = "local";
            ctx.S.local = localId;
            ctx.S.carpeta = "staff";
            ctx.S.activo = ctx.elegir(localId, "staff");
            ctx.suscribirHistorial();
            ctx.pintarTodo();
            ctx.modalNombreHoja(null);
        });
        return true;
    }
};
}

