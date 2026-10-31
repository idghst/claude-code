import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

// 만료된 세션 토큰을 갱신해 요청·응답 쿠키에 반영한다.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // 인증 쿠키가 담긴 응답이 CDN에 캐시되지 않도록 한다.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // createServerClient와 getClaims 사이에 다른 코드를 넣지 않는다(세션 갱신 누락 원인).
  await supabase.auth.getClaims();

  return response;
}
