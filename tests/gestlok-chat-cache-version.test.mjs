import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('la página de GESTLOK Chat carga el motor de confirmación sin caché anterior',()=>{
 const pagina=readFileSync(new URL('../public/chat/index.html',import.meta.url),'utf8');
 const cliente=readFileSync(new URL('../public/chat/chat.js',import.meta.url),'utf8');
 const motor=readFileSync(new URL('../public/chat/motor.js',import.meta.url),'utf8');
 assert.match(pagina,/src="\/chat\/chat\.js\?v=20261122vermenu1"/);
 assert.match(cliente,/from '\.\/motor\.js\?v=20261121confirmacion3'/);
 assert.match(motor,/Tiempo estimado de /);
});
