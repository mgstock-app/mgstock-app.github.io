import {mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dest=new URL('../public/vendor/hq-three/',import.meta.url);
mkdirSync(dest,{recursive:true});
for(const file of ['three.module.js','three.core.js']){
 copyFileSync(new URL('../node_modules/three/build/'+file,import.meta.url),new URL(file,dest));
}
copyFileSync(new URL('../node_modules/three/LICENSE',import.meta.url),new URL('LICENSE.txt',dest));
console.log('HQ Three.js local: '+fileURLToPath(dest));
