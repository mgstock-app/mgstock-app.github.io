// Utilidades compartidas por las pruebas de Android y iPhone.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const OUT = resolve('qa/mobile/out');
mkdirSync(OUT, { recursive: true });
export const PORT = 4173;
export const HOME = `http://localhost:${PORT}/`;
export const DEMO = `${HOME}?demo=1&shop=mercado&role=dueno`;
export const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
/** must=true: si falla, la prueba falla. must=false: se informa (depende del equipo de prueba). */
export function check(cond, msg, must = true) {
  results.push({ ok: !!cond, must, msg });
  console.log(`${cond ? 'OK  ' : must ? 'FAIL' : 'INFO'} ${msg}`);
  return !!cond;
}
export function finish(name) {
  writeFileSync(resolve(OUT, `${name}-resultados.json`), JSON.stringify(results, null, 2));
  const lines = results.map(r => `| ${r.ok ? '✅' : r.must ? '❌' : 'ℹ️'} | ${r.msg.replaceAll('|', '/')} |`);
  writeFileSync(resolve(OUT, `${name}-resumen.md`), `### ${name}\n\n| | Verificación |\n|---|---|\n${lines.join('\n')}\n`);
  const failed = results.filter(r => r.must && !r.ok).length;
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} OK · ${failed} fallas`);
  return failed;
}

/** El sitio compilado (out/) servido en localhost: es un origen seguro, igual que https. */
export function server() {
  let child = null;
  return {
    async start() {
      child = spawn(process.execPath, ['scripts/serve-static.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
      for (let i = 0; i < 50; i++) { try { if ((await fetch(HOME)).ok) return; } catch {} await sleep(200); }
      throw new Error('No arrancó el servidor de prueba');
    },
    stop() { if (child) { child.kill('SIGKILL'); child = null; } },
  };
}
