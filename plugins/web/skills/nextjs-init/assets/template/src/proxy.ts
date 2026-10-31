import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// 모든 요청: CSP nonce 발급 + Supabase 세션 갱신.
// 인가 판단은 여기서 하지 않는다. 실제 검증은 페이지·Server Action의 requireUser()가 한다.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseWs = supabaseUrl.replace(/^http/, "ws");

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabaseUrl}`,
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
