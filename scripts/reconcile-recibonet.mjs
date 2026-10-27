import { readFileSync } from 'node:fs';
import { reconcileReportBackups } from '../lib/recibonet/reconcile.mjs';

const paths=process.argv.slice(2);
if (paths.length!==2) {
  console.error('Uso: node scripts/reconcile-recibonet.mjs origen.json candidato.json');
  process.exitCode=2;
} else {
  try {
    const report=reconcileReportBackups(...paths.map(p=>JSON.parse(readFileSync(p,'utf8'))));
    // Only counts and hashes. Never log salaries, names, phones, signatures or record IDs.
    console.log(JSON.stringify(report,null,2));
    process.exitCode=report.reportsMatch?0:1;
  } catch {
    console.error('No se pudo verificar: archivo inválido, incompleto o ilegible. No se modificó ningún dato.');
    process.exitCode=2;
  }
}
