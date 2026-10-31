import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, required } from "@/lib/env";

// secret 키는 RLS를 우회한다. Server Action·Route Handler에서만, 꼭 필요할 때만 쓴다.
export function createAdminClient() {
  const { supabaseUrl } = publicEnv();
  const secretKey = required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
