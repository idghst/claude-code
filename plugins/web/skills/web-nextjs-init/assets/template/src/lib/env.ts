// NEXT_PUBLIC_ 값은 빌드 때 인라인되므로 process.env.이름 형태로 직접 참조해야 한다.
export function publicEnv() {
  return {
    supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`환경 변수 ${name}가 없습니다. .env.local을 확인하세요.`);
  return value;
}
