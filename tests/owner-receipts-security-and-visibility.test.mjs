import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('El Dueño ve TODOS los recibos de sus locales y períodos inicialmente',()=>{
 const ui=read('modules/empleados/components/reports/ReceiptDashboard.tsx');
 assert.match(ui,/const \[month, setMonth\] = useState\("todos"\)/);
 assert.match(ui,/<option value="todos">Todos los períodos<\/option>/);
 assert.match(ui,/current\.map\(\(row,i\) => <button/);
 assert.match(ui,/ReceiptPaper row=\{active\}/);
 assert.match(ui,/Historial/);
 assert.match(ui,/Privacidad:/);
 const overview=read('modules/empleados/components/reports/EmployeeOverview.tsx');
 assert.match(overview,/readReportCollection\(createClient\(\), "hojas", organizationId\)/);
 assert.match(overview,/safeLocals/);
 assert.match(overview,/row\.organization_id && row\.organization_id !== local\.organization_id/);
});

test('El colaborador jamás usa la lista de todos los recibos',()=>{
 const shell=read('modules/empleados/components/pages/ReportPortal.tsx');
 assert.match(shell,/user\?\.role === "employee" \? \(/);
 assert.match(shell,/<EmployeePortalShell \/>/);
 const personal=read('modules/empleados/components/reports/EmployeeReport.tsx');
 assert.match(personal,/accessApi\.privateReceipt\(\)/);
 assert.doesNotMatch(personal,/readReportCollection|ReceiptDashboard|\.from\("rm_test_documents"\)/);
 const api=read('modules/empleados/features/access/api.ts');
 assert.match(api,/rpc<import\("@\/components\/reports\/PrivateReceiptDetail"\)\.PrivateReceiptPayload>\(/);
 assert.match(api,/"rm_app_private_receipt_detail"/);
 const sql=read('supabase/migrations/20261028175500_recibos_informales_privados_detallados.sql');
 assert.match(sql,/a\.user_id=rm_test_private\.uid\(\)/);
 assert.match(sql,/a\.sheet_id=rm_test_private\.app_sheet\(\)/);
 assert.match(sql,/a\.opened_at is not null and a\.expires_at>clock_timestamp\(\)/);
 assert.match(sql,/revoke all on function public\.rm_app_private_receipt_detail\(\) from public,anon/);
});

test('Antes de exportar por WhatsApp hay que confirmar al destinatario individual',()=>{
 const js=read('modules/empleados/features/reports/sharing-and-backups.js');
 assert.match(js,/id="eDestinatarioConfirmado"/);
 assert.match(js,/if \(!ctx\.\$\("eDestinatarioConfirmado"\)\.checked\)/);
 assert.match(js,/confirmá que el destinatario es el colaborador correcto/);
 assert.match(js,/No enviar a grupos ni a terceros/);
 assert.match(js,/CONFIDENCIAL: verificá el chat antes de adjuntar el recibo/);
 assert.match(js,/ctx\.confirmarReporte\(h, "whatsapp"/);
 assert.doesNotMatch(read('modules/empleados/components/reports/EmployeeReport.tsx'),/Enviar por WhatsApp|Compartir recibo/);
});
