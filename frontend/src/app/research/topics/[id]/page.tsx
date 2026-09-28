import { ResearchTopicsPage } from "../../../notes/series/ResearchTopicsClient";

export default async function ResearchTopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResearchTopicsPage initialSeriesId={id} />;
}
