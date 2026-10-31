import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

// Client Component 전용. publishable 키만 쓰며 RLS가 데이터를 보호한다.
export function createClient() {
  const { supabaseUrl, supabasePublishableKey } = publicEnv();
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
