#!/usr/bin/env node
// 테이블 + RLS(CRUD별) + 인덱스 + updated_at 트리거 마이그레이션을 만든다.
// 사용법: node new-table.mjs --name posts --fields "title:text:required,body:text" [--access owner|public-read|read-only] [--dir .] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertIdentifier, parseArgs, parseFields, TYPES } from "../../../scripts/lib/fields.mjs";

const ACCESS = ["owner", "public-read", "read-only"];

export function buildMigration({ table, fields, access = "owner" }) {
  assertIdentifier(table, "테이블 이름");
  if (!ACCESS.includes(access)) throw new Error(`--access는 ${ACCESS.join(" | ")} 중 하나입니다.`);
  const t = `public.${table}`;
  const owned = access !== "read-only";
  const isOwner = "(select auth.uid()) = user_id";

  const columns = [
    "id uuid primary key default gen_random_uuid()",
    ...(owned ? ["user_id uuid not null default auth.uid() references auth.users (id) on delete cascade"] : []),
    ...fields.map((f) =>
      [
        f.name,
        TYPES[f.type].sql,
        f.required ? "not null" : null,
        f.default ? `default ${f.default}` : null,
        f.ref ? `references public.${f.ref} (id) on delete cascade` : null,
      ]
        .filter(Boolean)
        .join(" "),
    ),
    "created_at timestamptz not null default now()",
    "updated_at timestamptz not null default now()",
  ];

  const indexes = [
    ...(owned ? [`create index ${table}_user_id_idx on ${t} (user_id);`] : []),
    ...fields.filter((f) => f.ref).map((f) => `create index ${table}_${f.name}_idx on ${t} (${f.name});`),
    `create index ${table}_created_at_idx on ${t} (created_at desc);`,
  ];

  const policies = [];
  const grants = [];
  if (access === "owner") {
    policies.push(`create policy "${table}_select_own" on ${t} for select to authenticated using (${isOwner});`);
  } else if (access === "public-read") {
    policies.push(`create policy "${table}_select_all" on ${t} for select to anon, authenticated using (true);`);
    grants.push(`grant select on ${t} to anon;`);
  } else {
    policies.push(`create policy "${table}_select_authenticated" on ${t} for select to authenticated using (true);`);
  }
  if (owned) {
    policies.push(
      `create policy "${table}_insert_own" on ${t} for insert to authenticated with check (${isOwner});`,
      `create policy "${table}_update_own" on ${t} for update to authenticated using (${isOwner}) with check (${isOwner});`,
      `create policy "${table}_delete_own" on ${t} for delete to authenticated using (${isOwner});`,
    );
    grants.push(`grant select, insert, update, delete on ${t} to authenticated;`);
  } else {
    // read-only: 쓰기 정책이 없으므로 secret 키(createAdminClient)로만 쓸 수 있다.
    grants.push(`grant select on ${t} to authenticated;`);
  }

  return `-- ${table}: /web:web-supabase-table 로 생성 (access: ${access})

create table ${t} (
${columns.map((c) => `  ${c}`).join(",\n")}
);

${indexes.join("\n")}

alter table ${t} enable row level security;

${policies.join("\n")}

${grants.join("\n")}

-- updated_at 자동 갱신 (함수는 여러 테이블이 공유)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger ${table}_set_updated_at
before update on ${t}
for each row execute function public.set_updated_at();
`;
}

// Supabase CLI 형식: YYYYMMDDHHMMSS (UTC). 같은 초에 여러 개를 만들어도 버전이 겹치지 않게 기존 최대값보다 크게 한다.
export function nextVersion(existingFiles, now = new Date()) {
  const current = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const latest = existingFiles.map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean).sort().at(-1);
  return latest && latest >= current ? String(BigInt(latest) + 1n) : current;
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["dry-run"]);
  const table = args.name;
  const sql = buildMigration({ table, fields: parseFields(args.fields), access: args.access });
  if (args["dry-run"]) return void process.stdout.write(sql);

  const dir = path.join(path.resolve(args.dir ?? "."), "supabase", "migrations");
  fs.mkdirSync(dir, { recursive: true });
  const files = fs.readdirSync(dir);
  const existing = files.find((f) => f.endsWith(`_create_${table}.sql`));
  if (existing) throw new Error(`이미 마이그레이션이 있습니다: ${existing}. 변경은 새 alter 마이그레이션으로 작성하세요.`);

  const file = path.join(dir, `${nextVersion(files)}_create_${table}.sql`);
  fs.writeFileSync(file, sql);
  console.log(`✔ ${path.relative(process.cwd(), file)}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`✘ ${error.message}`);
    process.exit(1);
  }
}
