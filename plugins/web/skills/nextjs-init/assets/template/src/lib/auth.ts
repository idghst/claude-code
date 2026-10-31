import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// getClaims()는 JWT 서명을 검증한다. getSession()은 쿠키 값을 그대로 믿으므로 서버에서 쓰지 않는다.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

// 보호 페이지·Server Action 첫 줄에서 호출한다.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
