import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// globals.css의 `--font-sans: var(--font-sans)`가 이 변수를 받는다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: { default: "{{PROJECT_NAME}}", template: "%s | {{PROJECT_NAME}}" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // proxy.ts가 발급한 CSP nonce. next-themes의 인라인 스크립트에 필요하다.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
