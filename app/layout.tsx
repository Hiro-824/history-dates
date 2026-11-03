import type { Metadata } from "next";
import "./globals.css";
import { NavigationProvider } from "@/components/navigation";

export const metadata: Metadata = {
  title: "覚えよ | 日本史・世界史の年号暗記",
  description: "日本史・世界史の年号を、出題範囲と解答モードを選んで学習。学習履歴はこのブラウザに保存されます。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body><NavigationProvider>{children}</NavigationProvider></body></html>;
}
