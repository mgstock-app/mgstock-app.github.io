// Cliente de Supabase falso para probar la función «gestlok-chat» contra un PostgreSQL local:
// cada rpc() se ejecuta con psql como service_role (igual que en producción).
import {spawnSync} from 'node:child_process';
const lit = v => v === null || v === undefined ? 'null'
  : typeof v === 'number' || typeof v === 'boolean' ? String(v)
  : "'" + (typeof v === 'string' ? v : JSON.stringify(v)).replace(/'/g, "''") + "'";
export function createClient() {
  return {
    async rpc(fn, args) {
      const params = Object.entries(args || {}).map(([k, v]) => `${k} => ${lit(v)}`).join(', ');
      const sql = `\\set VERBOSITY verbose\nset role service_role;\nselect to_jsonb(public.${fn}(${params}));`;
      const r = spawnSync('psql', [process.env.CHAT_PG_DB, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], {input: sql, encoding: 'utf8'});
      if (r.status !== 0) {
        const m = (r.stderr || '').match(/ERROR:\s+([0-9A-Z]{5}):\s+(.*)/);
        return {data: null, error: {code: m?.[1] || 'XX000', message: m?.[2] || r.stderr}};
      }
      return {data: JSON.parse(r.stdout.trim().split('\n').pop()), error: null};
    },
    storage: {
      from(bucket) {
        const ejecutar = sql => spawnSync('psql',[process.env.CHAT_PG_DB,'-X','-q','-At','-v','ON_ERROR_STOP=1'],
          {input:sql,encoding:'utf8'});
        return {
          async upload(path,bytes) {
            const r=ejecutar('insert into storage.objects(bucket_id,name) values('+lit(bucket)+','+lit(path)+');');
            return r.status===0 ? {data:{path},error:null} : {data:null,error:{message:r.stderr}};
          },
          async createSignedUrl(path) {
            const r=ejecutar('select count(*) from storage.objects where bucket_id='+lit(bucket)+' and name='+lit(path)+';');
            if(r.status!==0 || Number(r.stdout.trim())!==1) return {data:null,error:{message:'Archivo no encontrado'}};
            return {data:{signedUrl:'https://test-storage.example/private/'+encodeURIComponent(path)},error:null};
          },
          async remove(paths) {
            for(const path of paths) ejecutar('delete from storage.objects where bucket_id='+lit(bucket)+' and name='+lit(path)+';');
            return {data:[],error:null};
          },
        };
      },
    },
  };
}
