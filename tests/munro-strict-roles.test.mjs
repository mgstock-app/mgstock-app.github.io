import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20261024_gestlok_munro_daily_strict_roles.sql', import.meta.url), 'utf8');

test('Munro daily: RLS only allows the creator or a manager assigned to Munro', () => {
  assert.match(sql, /as restrictive\s+for all\s+to authenticated/i);
  assert.match(sql, /col = 'munro\/munro_control' or col like '%\/diario'/i);
  assert.match(sql, /col in \('munro\/munro_control', 'munro\/diario'\)/i);
  assert.match(sql, /public\.mi_rol\(\) = 'creadora'/);
  assert.match(sql, /public\.mi_rol\(\) = 'gerente' and public\.puede_editar_local\('munro'\)/);
  assert.doesNotMatch(sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n'), /'editor'|'dueno'/);
  assert.match(sql, /with check\s*\(/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.docs|truncate|drop\s+table/i);
});
