/* Generates supabase/schema.sql — a consolidated snapshot of the live DB
   (tables, columns, constraints, indexes, RLS policies, functions,
   triggers, seed data, realtime publication). Run: node tools/gen-schema.mjs */
import postgres from "postgres";
import { writeFileSync } from "node:fs";
const url = process.env.DB_URL || "postgresql://postgres.teqnhdhearzrywiqssom:Ll8Zbop6Dr1OBx8b@aws-0-us-west-2.pooler.supabase.com:5432/postgres";
const sql = postgres(url, { max: 1, prepare: false });
const q = async (s) => await sql.unsafe(s);

const tables = await q(`select table_schema s, table_name t from information_schema.tables
  where table_schema in ('public','sp','mp') and table_type='BASE TABLE' order by table_schema, table_name`);

let out = `-- ═══════════════════════════════════════════════════════════════════
--  EXOTIC · COMPLETE SUPABASE SCHEMA (consolidated live snapshot)
--  Generated from the production database by tools/gen-schema.mjs.
--  Migrations 0001–0016 are the authoritative history; this file is
--  the full current state: schemas · tables (columns/PK/unique/checks)
--  · indexes · RLS policies · functions (RPCs) · triggers · seed data ·
--  realtime publication · edge-function reference.
--
--  Edge Functions (deployed via CLI, source in supabase/functions/):
--    · ai            — typed-question generation + oracle (mirrors /api/ai)
--    · rotate-shop   — daily featured-item rotation
--    · cleanup-rooms — stale room reaper
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists unaccent;

create schema if not exists sp;
create schema if not exists mp;
`;

const seeded = ["sp.achievements_catalog", "sp.shop_items", "mp.achievements_catalog", "mp.shop_items"];
const seedData = {};

for (const { s, t } of tables) {
  const fq = `${s}.${t}`;
  const cols = await q(`select column_name, data_type, udt_name, character_maximum_length, column_default, is_nullable
    from information_schema.columns where table_schema='${s}' and table_name='${t}' order by ordinal_position`);
  const cons = await q(`select conname, pg_get_constraintdef(oid) def from pg_constraint
    where conrelid = '${fq}'::regclass and contype in ('p','u','c','f') order by contype`);
  out += `\n-- ── table ${fq} ──\nCREATE TABLE ${fq} (\n`;
  out += cols.map(c => {
    let typ = c.data_type === 'character varying' ? `varchar(${c.character_maximum_length ?? '*'})` : (c.data_type === 'USER-DEFINED' ? c.udt_name : c.data_type);
    if (c.data_type === 'ARRAY') typ = c.udt_name.replace(/^_/, '') + '[]';
    return `  ${c.column_name} ${typ}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}`;
  }).join(',\n');
  for (const c of cons) out += `,\n  CONSTRAINT ${c.conname} ${c.def}`;
  out += `\n);`;
  if (seeded.includes(fq)) seedData[fq] = await q(`select * from ${fq} order by 1`);
}

out += `\n-- ═══════════════════════════════ INDEXES ═══════════════════════════════\n`;
const idx = await q(`select indexdef from pg_indexes where schemaname in ('sp','mp') and indexname not like '%_pkey' order by schemaname, indexname`);
for (const i of idx) out += `${i.indexdef};\n`;

out += `\n-- ═══════════════════════════════ RLS ═══════════════════════════════\n`;
for (const r of await q(`select schemaname s, tablename t from pg_tables where schemaname in ('sp','mp') order by 1,2`))
  out += `ALTER TABLE ${r.s}.${r.t} ENABLE ROW LEVEL SECURITY;\n`;
out += `\n`;
for (const p of await q(`select * from pg_policies where schemaname in ('sp','mp') order by schemaname, tablename, policyname`))
  out += `CREATE POLICY ${p.policyname} ON ${p.schemaname}.${p.tablename} FOR ${p.cmd} TO ${p.roles.join(', ')}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''};\n`;

out += `\n-- ═══════════════════════════════ FUNCTIONS (RPCs) ═══════════════════════════════\n`;
const fns = await q(`select n.nspname s, p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('sp','mp') and p.proname not like 'pg_%' order by n.nspname, p.proname`);
for (const f of fns) out += `\n-- ${f.s}.${f.proname}\n${f.def};\n`;
const pubfns = await q(`select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname = 'public' and p.proname in ('gen_code','code_feedback','make_clue','handle_new_user') order by p.proname`);
out += `\n-- public helpers\n`;
for (const f of pubfns) out += `\n${f.def};\n`;

out += `\n-- ═══════════════════════════════ TRIGGERS ═══════════════════════════════\n`;
const trgs = await q(`select pg_get_triggerdef(oid) def from pg_trigger where not tgisinternal and tgrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('sp','mp','public')) order by tgrelid::regclass::text, tgname`);
for (const t of trgs) out += `${t.def};\n`;

out += `\n-- ═══════════════════════════════ SEED DATA ═══════════════════════════════\n`;
const esc = (v) => v === null ? 'NULL' : typeof v === 'object' ? `'${JSON.stringify(v)}'::jsonb` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
for (const [fq, rows] of Object.entries(seedData)) {
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  out += `\nINSERT INTO ${fq} (${cols.join(', ')}) VALUES\n`;
  out += rows.map(r => `  (${cols.map(c => esc(r[c])).join(', ')})`).join(',\n');
  out += `\nON CONFLICT DO NOTHING;\n`;
}

out += `\n-- ═══════════════════════════════ REALTIME ═══════════════════════════════\n`;
const pubtabs = await q(`select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' order by 1,2`);
out += `-- ${pubtabs.length} tables stream live (RLS guards every stream):\n`;
for (const p of pubtabs) out += `ALTER PUBLICATION supabase_realtime ADD TABLE ${p.schemaname}.${p.tablename};\n`;

writeFileSync("supabase/schema.sql", out);
console.log(`schema.sql: ${out.split("\n").length} lines — ${tables.length} tables, ${fns.length + pubfns.length} functions, ? policies`);
await sql.end();
