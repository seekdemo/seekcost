import GuideRoom from "../GuideRoom";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GuideRoom stockId={Number(id)} />;
}
