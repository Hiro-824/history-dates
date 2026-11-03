import { Suspense } from "react";
import { StudyRoute } from "@/components/quiz";
import { PageLoading } from "@/components/page-loading";

export default function Page() {
  return <Suspense fallback={<PageLoading kind="study"/>}><StudyRoute/></Suspense>;
}
