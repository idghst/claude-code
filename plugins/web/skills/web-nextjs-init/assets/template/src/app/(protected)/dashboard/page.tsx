import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";

export const metadata: Metadata = { title: "대시보드" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>대시보드</CardTitle>
          <CardDescription>{user.email}로 로그인했습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logout}>
            <Button type="submit" variant="outline">
              로그아웃
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
