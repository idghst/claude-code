#!/usr/bin/env node
// Supabase 테이블 하나에 대한 보호 화면(목록·생성·삭제)을 만든다.
// 사용법: node new-feature.mjs --name posts --fields "title:text:required,body:text" [--dir .] [--force] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertIdentifier, parseArgs, parseFields, toCamel, toKebab, toPascal, TYPES } from "../../../scripts/lib/fields.mjs";

const zodFor = (f) => (f.required ? TYPES[f.type].zod : (TYPES[f.type].optionalZod ?? `${TYPES[f.type].zod}.optional()`));

function schemaFile({ camel, pascal, fields }) {
  return `import { z } from "zod";

export const ${camel}Schema = z.object({
${fields.map((f) => `  ${f.name}: ${zodFor(f)},`).join("\n")}
});

export type ${pascal}Input = z.infer<typeof ${camel}Schema>;

export type ${pascal}Row = {
  id: string;
  created_at: string;
${fields.map((f) => `  ${f.name}: ${TYPES[f.type].ts}${f.required || f.type === "boolean" ? "" : " | null"};`).join("\n")}
};
`;
}

function actionsFile({ table, kebab, camel, pascal }) {
  return `"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ${camel}Schema } from "@/lib/validations/${kebab}";

export async function create${pascal}(values: unknown): Promise<{ error?: string }> {
  await requireUser();
  const parsed = ${camel}Schema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };

  // 빈 문자열은 null로 저장한다. user_id는 DB 기본값 auth.uid()가 채우고 RLS가 검증한다.
  const row = Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [key, value === "" ? null : value]));
  const supabase = await createClient();
  const { error } = await supabase.from("${table}").insert(row);
  if (error) {
    console.error("create${pascal}", error);
    return { error: "저장하지 못했습니다." };
  }

  revalidatePath("/${kebab}");
  return {};
}

export async function delete${pascal}(id: string) {
  await requireUser();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return;

  // 본인 행만 지워지는 것은 RLS delete 정책이 보장한다.
  const supabase = await createClient();
  const { error } = await supabase.from("${table}").delete().eq("id", parsedId.data);
  if (error) console.error("delete${pascal}", error);
  revalidatePath("/${kebab}");
}
`;
}

function displayValue(f) {
  const v = `row.${f.name}`;
  if (f.type === "boolean") return `{${v} ? "예" : "아니오"}`;
  return f.required ? `{${v}}` : `{${v} ?? "-"}`;
}

function pageFile({ table, kebab, pascal, fields }) {
  const columns = ["id", "created_at", ...fields.map((f) => f.name)].join(", ");
  return `import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ${pascal}Row } from "@/lib/validations/${kebab}";
import { delete${pascal} } from "./actions";
import { ${pascal}Form } from "./${kebab}-form";

export const metadata: Metadata = { title: "${pascal}" };
export const dynamic = "force-dynamic";

export default async function ${pascal}Page() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("${table}")
    .select("${columns}")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("목록을 불러오지 못했습니다.");
  const rows: ${pascal}Row[] = data ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>새 ${pascal}</CardTitle>
        </CardHeader>
        <CardContent>
          <${pascal}Form />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-center text-sm">아직 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
${fields.map((f) => `                    <dt className="text-muted-foreground">${f.name}</dt>\n                    <dd>${displayValue(f)}</dd>`).join("\n")}
                  </dl>
                  <form action={delete${pascal}.bind(null, row.id)}>
                    <Button type="submit" variant="outline" size="sm">
                      삭제
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`;
}

function inputFor(f) {
  const { input } = TYPES[f.type];
  const invalid = `!!errors.${f.name}`;
  if (input === "checkbox") {
    return `        <Field orientation="horizontal" data-invalid={${invalid}}>
          <input id="${f.name}" type="checkbox" className="accent-primary size-4" {...register("${f.name}")} />
          <FieldLabel htmlFor="${f.name}">${f.name}</FieldLabel>
          <FieldError errors={[errors.${f.name}]} />
        </Field>`;
  }
  // 빈 입력은 undefined로 넘겨 zod가 필수/선택을 판단하게 한다.
  const setValueAs =
    input === "number"
      ? `, { setValueAs: (v: string) => (v === "" ? undefined : Number(v)) }`
      : f.type === "text"
        ? ""
        : `, { setValueAs: (v: string) => (v === "" ? undefined : v) }`;
  const step = input === "number" ? ` step="${f.type === "numeric" ? "any" : "1"}"` : "";
  return `        <Field data-invalid={${invalid}}>
          <FieldLabel htmlFor="${f.name}">${f.name}</FieldLabel>
          <Input id="${f.name}" type="${input}"${step} aria-invalid={${invalid}} {...register("${f.name}"${setValueAs})} />
          <FieldError errors={[errors.${f.name}]} />
        </Field>`;
}

function formFile({ kebab, camel, pascal, fields }) {
  const booleans = fields.filter((f) => f.type === "boolean");
  const defaults = booleans.length ? `, defaultValues: { ${booleans.map((f) => `${f.name}: false`).join(", ")} }` : "";
  return `"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ${camel}Schema, type ${pascal}Input } from "@/lib/validations/${kebab}";
import { create${pascal} } from "./actions";

export function ${pascal}Form() {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<${pascal}Input>({ resolver: zodResolver(${camel}Schema)${defaults} });

  const onSubmit = (values: ${pascal}Input) =>
    startTransition(async () => {
      const result = await create${pascal}(values);
      if (result.error) return void toast.error(result.error);
      toast.success("저장했습니다.");
      reset();
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
${fields.map(inputFor).join("\n")}
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중..." : "저장"}
        </Button>
      </FieldGroup>
    </form>
  );
}
`;
}

export function buildFeature({ table, fields }) {
  assertIdentifier(table, "테이블 이름");
  const unsupported = fields.filter((f) => !TYPES[f.type].input);
  if (unsupported.length) throw new Error(`폼에서 지원하지 않는 타입: ${unsupported.map((f) => `${f.name}:${f.type}`).join(", ")}. 해당 컬럼은 --fields에서 빼고 직접 구현하세요.`);

  const ctx = { table, fields, kebab: toKebab(table), camel: toCamel(table), pascal: toPascal(table) };
  const dir = `src/app/(protected)/${ctx.kebab}`;
  return {
    [`src/lib/validations/${ctx.kebab}.ts`]: schemaFile(ctx),
    [`${dir}/actions.ts`]: actionsFile(ctx),
    [`${dir}/page.tsx`]: pageFile(ctx),
    [`${dir}/${ctx.kebab}-form.tsx`]: formFile(ctx),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2), ["force", "dry-run"]);
  const root = path.resolve(args.dir ?? ".");
  const files = buildFeature({ table: args.name, fields: parseFields(args.fields) });

  if (args["dry-run"]) {
    for (const [rel, content] of Object.entries(files)) console.log(`// ===== ${rel}\n${content}`);
    return;
  }
  for (const required of ["src/lib/auth.ts", "src/lib/supabase/server.ts", "src/components/ui/field.tsx"]) {
    if (!fs.existsSync(path.join(root, required))) throw new Error(`${required}가 없습니다. /web:nextjs-init으로 만든 프로젝트에서 실행하세요.`);
  }
  const conflicts = Object.keys(files).filter((rel) => fs.existsSync(path.join(root, rel)));
  if (conflicts.length && !args.force) throw new Error(`이미 있는 파일: ${conflicts.join(", ")}. 덮어쓰려면 --force.`);

  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    console.log(`✔ ${rel}`);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`✘ ${error.message}`);
    process.exit(1);
  }
}
