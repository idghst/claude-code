// web-supabase-table과 web-feature가 함께 쓰는 필드 정의 파서.
// 형식: "이름:타입[:required][:default=값][:ref=테이블]" 를 쉼표로 구분.
// 예: "title:text:required,views:integer:default=0,category_id:uuid:ref=categories"

export const RESERVED_COLUMNS = new Set(["id", "user_id", "created_at", "updated_at"]);
const IDENT = /^[a-z][a-z0-9_]{0,62}$/;
const DEFAULT_LITERAL = /^(true|false|-?\d+(\.\d+)?|now\(\)|gen_random_uuid\(\)|'[^'\\]*')$/;

// sql: 컬럼 타입, zod: 스키마 식(선택 컬럼은 .optional()을 붙임), ts: 조회 행 타입, input: 폼 입력 종류
export const TYPES = {
  text: { sql: "text", zod: 'z.string().trim().min(1, "필수 항목입니다.").max(5000)', optionalZod: "z.string().trim().max(5000)", ts: "string", input: "text" },
  integer: { sql: "integer", zod: 'z.number({ error: "숫자를 입력하세요." }).int()', ts: "number", input: "number" },
  bigint: { sql: "bigint", zod: 'z.number({ error: "숫자를 입력하세요." }).int()', ts: "number", input: "number" },
  numeric: { sql: "numeric", zod: 'z.number({ error: "숫자를 입력하세요." })', ts: "number", input: "number" },
  boolean: { sql: "boolean", zod: "z.boolean()", optionalZod: "z.boolean()", ts: "boolean", input: "checkbox" },
  date: { sql: "date", zod: 'z.iso.date({ error: "날짜를 입력하세요." })', ts: "string", input: "date" },
  timestamptz: { sql: "timestamptz", zod: 'z.string({ error: "필수 항목입니다." }).min(1)', ts: "string", input: "datetime-local" },
  uuid: { sql: "uuid", zod: 'z.uuid({ error: "올바른 UUID가 아닙니다." })', ts: "string", input: "text" },
  jsonb: { sql: "jsonb", zod: null, ts: null, input: null },
};

export function assertIdentifier(value, label) {
  if (!IDENT.test(value ?? "")) {
    throw new Error(`${label} "${value}"가 올바르지 않습니다. 소문자로 시작하는 소문자·숫자·밑줄(63자 이하)만 허용합니다.`);
  }
  return value;
}

export function parseFields(spec) {
  if (!spec?.trim()) throw new Error("--fields가 비어 있습니다.");
  const seen = new Set();
  return spec.split(",").map((raw) => {
    const [name, type, ...opts] = raw.trim().split(":");
    assertIdentifier(name, "컬럼 이름");
    if (RESERVED_COLUMNS.has(name)) throw new Error(`"${name}"은 자동 생성 컬럼이라 지정할 수 없습니다.`);
    if (seen.has(name)) throw new Error(`컬럼 "${name}"이 중복됩니다.`);
    seen.add(name);
    if (!TYPES[type]) throw new Error(`컬럼 "${name}"의 타입 "${type}"은 지원하지 않습니다. 가능: ${Object.keys(TYPES).join(", ")}`);

    const field = { name, type, required: false, default: null, ref: null };
    for (const opt of opts) {
      if (opt === "required") field.required = true;
      else if (opt.startsWith("default=")) {
        const value = opt.slice("default=".length);
        if (!DEFAULT_LITERAL.test(value)) throw new Error(`컬럼 "${name}"의 기본값 ${value}는 허용되지 않습니다(숫자, true/false, now(), gen_random_uuid(), '문자열').`);
        field.default = value;
      } else if (opt.startsWith("ref=")) {
        if (type !== "uuid") throw new Error(`ref는 uuid 컬럼에만 쓸 수 있습니다: ${name}`);
        field.ref = assertIdentifier(opt.slice("ref=".length), "참조 테이블");
      } else throw new Error(`컬럼 "${name}"의 옵션 "${opt}"를 알 수 없습니다.`);
    }
    return field;
  });
}

export function parseArgs(argv, booleans = []) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`알 수 없는 인자: ${key}`);
    const name = key.slice(2);
    if (booleans.includes(name)) args[name] = true;
    else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${key}에 값이 필요합니다.`);
      args[name] = value;
    }
  }
  return args;
}

export const toKebab = (snake) => snake.replaceAll("_", "-");
export const toPascal = (snake) => snake.split("_").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
export const toCamel = (snake) => {
  const pascal = toPascal(snake);
  return pascal[0].toLowerCase() + pascal.slice(1);
};
