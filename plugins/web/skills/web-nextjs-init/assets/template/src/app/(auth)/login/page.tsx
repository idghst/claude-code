import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
