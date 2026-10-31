import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "회원가입" };
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>회원가입</CardTitle>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </main>
  );
}
