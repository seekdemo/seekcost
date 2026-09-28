import { ResearchPage } from "../../notes/NotesClient";

export default async function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResearchPage initialNoteId={id} />;
}
