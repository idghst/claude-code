// 실행: node --test plugins/web/tests
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseFields } from "../scripts/lib/fields.mjs";
import { buildMigration, nextVersion } from "../skills/web-supabase-table/scripts/new-table.mjs";
import { buildFeature } from "../skills/web-feature/scripts/new-feature.mjs";
import { audit } from "../skills/web-security-audit/scripts/audit.mjs";

test("parseFields: 옵션 파싱", () => {
  const [title, views, cat] = parseFields("title:text:required,views:integer:default=0,category_id:uuid:ref=categories");
  assert.deepEqual(title, { name: "title", type: "text", required: true, default: null, ref: null });
  assert.equal(views.default, "0");
  assert.equal(cat.ref, "categories");
});

test("parseFields: 위험한 입력 거부", () => {
  assert.throws(() => parseFields("title;drop table x:text"), /올바르지 않습니다/);
  assert.throws(() => parseFields("title:text:default=1);drop"), /허용되지 않습니다/);
  assert.throws(() => parseFields("id:uuid"), /자동 생성/);
  assert.throws(() => parseFields("a:varchar"), /지원하지 않습니다/);
  assert.throws(() => parseFields("a:text,a:text"), /중복/);
  assert.throws(() => parseFields("a:text:ref=b"), /uuid 컬럼에만/);
});

test("buildMigration owner: RLS·CRUD 정책·인덱스", () => {
  const sql = buildMigration({ table: "posts", fields: parseFields("title:text:required") });
  assert.match(sql, /alter table public\.posts enable row level security/);
  for (const op of ["select", "insert", "update", "delete"]) assert.match(sql, new RegExp(`for ${op} to authenticated`));
  assert.doesNotMatch(sql, /for all/);
  assert.match(sql, /create index posts_user_id_idx/);
  assert.match(sql, /title text not null/);
  assert.doesNotMatch(sql, /(?<!select |default )auth\.uid\(\)/);
});

test("nextVersion: 같은 초에 만들어도 버전이 겹치지 않는다", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  assert.equal(nextVersion([], now), "20261101000000");
  assert.equal(nextVersion(["20261101000000_create_a.sql", ".gitkeep"], now), "20261101000001");
  assert.equal(nextVersion(["20251231235959_create_a.sql"], now), "20261101000000");
});

test("buildMigration public-read / read-only", () => {
  const pub = buildMigration({ table: "notices", fields: parseFields("title:text"), access: "public-read" });
  assert.match(pub, /for select to anon, authenticated using \(true\)/);
  assert.match(pub, /grant select on public\.notices to anon/);
  const ro = buildMigration({ table: "codes", fields: parseFields("label:text"), access: "read-only" });
  assert.doesNotMatch(ro, /user_id/);
  assert.doesNotMatch(ro, /for insert/);
  assert.doesNotMatch(ro, /anon/);
  assert.throws(() => buildMigration({ table: "x", fields: [], access: "nope" }), /--access/);
});

test("buildFeature: 파일 구성과 필수 규칙", () => {
  const files = buildFeature({ table: "blog_posts", fields: parseFields("title:text:required,views:integer,published:boolean") });
  assert.deepEqual(Object.keys(files).sort(), [
    "src/app/(protected)/blog-posts/actions.ts",
    "src/app/(protected)/blog-posts/blog-posts-form.tsx",
    "src/app/(protected)/blog-posts/page.tsx",
    "src/lib/validations/blog-posts.ts",
  ]);
  const actions = files["src/app/(protected)/blog-posts/actions.ts"];
  assert.equal(actions.match(/await requireUser\(\)/g).length, 2);
  assert.match(actions, /safeParse/);
  assert.match(files["src/app/(protected)/blog-posts/page.tsx"], /force-dynamic/);
  assert.match(files["src/lib/validations/blog-posts.ts"], /views: z\.number\(.*\)\.int\(\)\.optional\(\)/);
  assert.throws(() => buildFeature({ table: "x", fields: parseFields("meta:jsonb") }), /jsonb/);
});

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  for (const [rel, content] of Object.entries({ "package.json": "{}", ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test("audit: 위반 사항을 모두 잡는다", () => {
  const root = fixture({
    ".gitignore": "node_modules\n",
    ".env.example": "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=x\nSUPABASE_SECRET_KEY=sb_secret_abcdefghijklmnopqrstuvwx\n",
    "src/components/bad.tsx": `"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";\n`,
    "src/lib/admin2.ts": `export const k = process.env.SUPABASE_SECRET_KEY;\n`,
    "src/lib/session.ts": `// getSession() 주석은 무시\nconst s = await supabase.auth.getSession();\n`,
    "src/app/(protected)/x/page.tsx": `export default function P() { return null }\n`,
    "src/app/(protected)/x/actions.ts": `"use server";\nexport async function a() {}\n`,
    "supabase/migrations/1_a.sql": `create table public.a (id uuid);\ncreate policy "p" on public.a for all using (auth.uid() = id);\ncreate policy "m" on public.a for select using ((raw_user_meta_data->>'role') = 'admin');\n`,
  });
  const rules = new Set(audit(root).map((f) => f.rule));
  for (const rule of [
    "public-secret-env",
    "hardcoded-secret-key",
    "admin-in-client",
    "secret-without-server-only",
    "server-get-session",
    "protected-page-no-auth",
    "protected-page-cacheable",
    "server-action-no-auth",
    "table-without-rls",
    "policy-for-all",
    "uid-not-wrapped",
    "user-metadata-authz",
    "env-not-ignored",
    "no-proxy",
  ]) {
    assert.ok(rules.has(rule), `${rule} 누락`);
  }
});

test("audit: 생성기 결과물은 통과한다", () => {
  const feature = buildFeature({ table: "posts", fields: parseFields("title:text:required") });
  const root = fixture({
    ".gitignore": ".env*\n!.env.example\n",
    "next.config.ts": "const nextConfig = { poweredByHeader: false };\n",
    "src/proxy.ts": `response.headers.set("Content-Security-Policy", csp);\n`,
    "src/lib/supabase/admin.ts": `import "server-only";\nconst k = process.env.SUPABASE_SECRET_KEY;\n`,
    "supabase/migrations/1_posts.sql": buildMigration({ table: "posts", fields: parseFields("title:text:required") }),
    ...feature,
  });
  assert.deepEqual(audit(root), []);
});
