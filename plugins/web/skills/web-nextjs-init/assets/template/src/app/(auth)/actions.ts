"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema } from "@/lib/validations/auth";

export type AuthResult = { error?: string; message?: string };

// Server Action 입력은 클라이언트 검증과 별개로 서버에서 다시 검증한다.
export async function login(values: unknown): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };

  redirect("/dashboard");
}

export async function signup(values: unknown): Promise<AuthResult> {
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return { error: "입력값을 확인하세요." };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` },
  });
  if (error) return { error: error.message };

  return { message: "확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 마치세요." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
