import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 이메일 확인 링크(token_hash) 처리. next는 같은 사이트 경로만 허용한다(오픈 리다이렉트 방지).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safePath(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=confirm", request.url));
}

function safePath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/dashboard";
}
