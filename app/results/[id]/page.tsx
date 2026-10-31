import { Suspense } from "react";
import { ResultsPage } from "@/components/quiz";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<p className="route-loading">読み込み中</p>}><Content params={params}/></Suspense>;
}
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultsPage sessionId={id}/>;
}
