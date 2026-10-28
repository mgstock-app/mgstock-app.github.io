/* eslint-disable @typescript-eslint/no-require-imports */
/* Cada caso Cypress pertenece a exactamente un grupo. Sin excluir tests. */
const { readdirSync, statSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const directory = resolve(__dirname, "../cypress/e2e");
const count = Number(process.env.CYPRESS_SHARD_TOTAL || "4");
const index = Number(process.env.CYPRESS_SHARD_INDEX || "0");
assert(Number.isInteger(count) && count >= 1 && count <= 16, "Número de grupos no válido");
assert(Number.isInteger(index) && index >= 0 && index < count, "Grupo Cypress no válido");
const files = readdirSync(directory)
  .filter(file => /\.cy\.(js|cjs|mjs)$/.test(file))
  .map(name => ({name, size: statSync(join(directory, name)).size}))
  .sort((a,b) => b.size - a.size || a.name.localeCompare(b.name));
assert(files.length > 0, "No se encontraron casos Cypress");
const groups = Array.from({length:count}, () => ({size:0,names:[]}));
for(const file of files) {
  // Distribución por tamaño de especificación. Determinista, exhaustiva.
  const destination = groups.reduce((min,current) =>
    current.size < min.size || (current.size === min.size && current.names.length < min.names.length)
      ? current : min, groups[0]);
  destination.names.push(file.name);
  destination.size += file.size;
}
const assigned = groups.flatMap(group => group.names);
assert.equal(assigned.length, files.length, "Faltan casos Cypress");
assert.equal(new Set(assigned).size, files.length, "Hay casos Cypress repetidos");
assert(groups.every(group => group.names.length > 0), "Un grupo quedó sin tests");
for (const [i,group] of groups.entries()) {
  console.log("Cypress grupo "+i+": "+group.names.length+" archivos / "+group.size+" bytes");
}
if(process.argv.includes("--run")) {
  const selected = groups[index].names.sort().map(name => "cypress/e2e/"+name).join(",");
  console.log("Ejecutando grupo "+index+"/"+count+": "+selected);
  const result = spawnSync("npm",["--prefix","qa","test","--","--spec",selected],{
    cwd:resolve(__dirname,"../.."),stdio:"inherit",env:process.env,
  });
  if(result.error) throw result.error;
  process.exit(result.status === null ? 1 : result.status);
}
