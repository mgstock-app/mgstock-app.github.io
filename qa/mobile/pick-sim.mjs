// Elige el iPhone del simulador con la versión de iOS más nueva instalada en la Mac de GitHub.
import { execSync } from 'node:child_process';
const list = JSON.parse(execSync('xcrun simctl list devices available -j').toString()).devices;
const version = key => (key.match(/iOS-(\d+)-(\d+)/) || []).slice(1).map(Number);
const runtimes = Object.keys(list).filter(k => /SimRuntime\.iOS-/.test(k) && list[k].some(d => /^iPhone/.test(d.name)))
  .sort((a, b) => { const [a1, a2] = version(a), [b1, b2] = version(b); return b1 - a1 || b2 - a2; });
if (!runtimes.length) throw new Error('No hay simuladores de iPhone');
const devices = list[runtimes[0]].filter(d => /^iPhone/.test(d.name));
const pick = devices.find(d => /^iPhone \d+$/.test(d.name)) || devices.find(d => /Pro$/.test(d.name)) || devices[0];
console.log(`udid=${pick.udid}`);
console.log(`name=${pick.name}`);
console.log(`version=${version(runtimes[0]).join('.')}`);
console.error(`Simulador: ${pick.name} · iOS ${version(runtimes[0]).join('.')} (${pick.udid})`);
