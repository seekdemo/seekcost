import WatchlistDetailView from "../detail/WatchlistDetailView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WatchlistDetailView stockId={Number(id)} />;
}
