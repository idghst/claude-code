#!/usr/bin/env node
// create-next-app + shadcn init 직후의 프로젝트에 템플릿을 입힌다.
// 사용법: node apply-template.mjs <projectDir> --name <project-name>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "template");
// create-next-app이 만든 기본 파일이라 덮어써도 되는 것들.
const OVERWRITABLE = new Set(["src/app/layout.tsx", "src/app/page.tsx"]);
const FONT_SRC = "node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";

function fail(message) {
  console.error(`✘ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [projectDir, ...rest] = argv;
  const nameIdx = rest.indexOf("--name");
  const name = nameIdx >= 0 ? rest[nameIdx + 1] : undefined;
  if (!projectDir || !name) fail("사용법: node apply-template.mjs <projectDir> --name <project-name>");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`프로젝트 이름은 소문자·숫자·하이픈만 쓸 수 있습니다: ${name}`);
  return { root: path.resolve(projectDir), name };
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

function checkPrerequisites(root) {
  const pkgPath = path.join(root, "package.json");
  if (!fs.existsSync(pkgPath)) fail(`${root}에 package.json이 없습니다. create-next-app을 먼저 실행하세요.`);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const missing = ["next", "@supabase/ssr", "@supabase/supabase-js", "zod", "react-hook-form", "@hookform/resolvers", "next-themes", "server-only", "sonner", "pretendard"].filter((d) => !deps[d]);
  if (missing.length) fail(`설치되지 않은 패키지: ${missing.join(", ")}`);
  for (const f of ["src/app/globals.css", "components.json", "src/components/ui/field.tsx", "src/components/ui/sonner.tsx", FONT_SRC]) {
    if (!fs.existsSync(path.join(root, f))) fail(`${f}가 없습니다. SKILL.md의 앞 단계를 확인하세요.`);
  }
  return pkg;
}

function copyTemplate(root, name) {
  const files = listFiles(TEMPLATE_DIR);
  // 쓰기 전에 충돌부터 모두 확인해, 중간에 멈춰 반쯤 덮어쓴 상태가 되지 않게 한다.
  const conflicts = files.filter((f) => fs.existsSync(path.join(root, f)) && !OVERWRITABLE.has(f));
  if (conflicts.length) fail(`이미 있는 파일이라 덮어쓰지 않습니다: ${conflicts.join(", ")}`);

  for (const rel of files) {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const content = fs.readFileSync(path.join(TEMPLATE_DIR, rel), "utf8").replaceAll("{{PROJECT_NAME}}", name);
    fs.writeFileSync(dest, content);
  }
  return files;
}

function ensureLines(file, lines) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const existing = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const toAdd = lines.filter((l) => !existing.has(l));
  if (toAdd.length) fs.writeFileSync(file, `${current.replace(/\n?$/, "\n")}${toAdd.join("\n")}\n`);
  return toAdd;
}

function patchPackageJson(root, pkg) {
  pkg.scripts = {
    ...pkg.scripts,
    typecheck: "tsc --noEmit",
    // shortcut: POSIX 셸 전용, Windows 지원이 필요하면 node 스크립트로 바꾼다.
    "db:types":
      "sh -c 'set -a; . ./.env.local; set +a; pnpm dlx supabase gen types --lang=typescript --project-id \"$SUPABASE_PROJECT_ID\" --schema public > src/types/database.types.ts'",
  };
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

function patchNextConfig(root) {
  const file = path.join(root, "next.config.ts");
  if (!fs.existsSync(file)) return "next.config.ts 없음: poweredByHeader: false를 직접 추가하세요.";
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("poweredByHeader")) return null;
  const anchor = "const nextConfig: NextConfig = {";
  if (!src.includes(anchor)) return "next.config.ts 형식이 예상과 달라 poweredByHeader: false를 직접 추가하세요.";
  fs.writeFileSync(file, src.replace(anchor, `${anchor}\n  poweredByHeader: false,`));
  return null;
}

const { root, name } = parseArgs(process.argv.slice(2));
const pkg = checkPrerequisites(root);
const written = copyTemplate(root, name);

fs.mkdirSync(path.join(root, "src/app/fonts"), { recursive: true });
fs.copyFileSync(path.join(root, FONT_SRC), path.join(root, "src/app/fonts/PretendardVariable.woff2"));
fs.mkdirSync(path.join(root, "supabase/migrations"), { recursive: true });
fs.writeFileSync(path.join(root, "supabase/migrations/.gitkeep"), "");
fs.mkdirSync(path.join(root, "src/types"), { recursive: true });

const envLocal = path.join(root, ".env.local");
const createdEnv = !fs.existsSync(envLocal);
if (createdEnv) fs.copyFileSync(path.join(root, ".env.example"), envLocal);

const gitignoreAdded = ensureLines(path.join(root, ".gitignore"), [".env*", "!.env.example"]);
patchPackageJson(root, pkg);
const warning = patchNextConfig(root);

console.log(`✔ 템플릿 적용 완료: ${root}`);
console.log(`  파일 ${written.length}개 작성, 폰트 복사, supabase/migrations 생성`);
if (createdEnv) console.log("  .env.local을 placeholder로 만들었습니다. 실제 Supabase 값으로 바꾸세요.");
if (gitignoreAdded.length) console.log(`  .gitignore에 추가: ${gitignoreAdded.join(", ")}`);
if (warning) console.log(`⚠ ${warning}`);
