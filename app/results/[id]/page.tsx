import { Suspense } from "react";
import { ResultsRoute } from "@/components/quiz";
import { PageLoading } from "@/components/page-loading";

export default function Page() {
  return <Suspense fallback={<PageLoading kind="results"/>}><ResultsRoute/></Suspense>;
}
