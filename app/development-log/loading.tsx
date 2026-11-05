import { AppShell } from "@/components/app-shell";
import { LoadingContent } from "@/components/page-loading";

export default function Loading() {
  return <AppShell active="development-log"><LoadingContent label="アップデートを読み込んでいます"/></AppShell>;
}
