import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

// Server Component·Server Action·Route Handler용. 요청마다 새로 만든다(전역 공유 금지).
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = publicEnv();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy가 맡는다.
        }
      },
    },
  });
}
