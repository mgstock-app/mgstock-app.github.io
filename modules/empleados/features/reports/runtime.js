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
    deliverySaved: (id, data) => { ctx.S.srv[id] = ctx.clon(data); if (ctx.S.activo === id) ctx.suscribirHistorial(); ctx.pintarTodo(); }
};
}

