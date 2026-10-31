import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">{"{{PROJECT_NAME}}"}</h1>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/login">로그인</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">대시보드</Link>
        </Button>
      </div>
    </main>
  );
}
