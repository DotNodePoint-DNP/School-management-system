import { ContentDetail } from "@/modules/website/CollectionPage";
import { getContent } from "@/modules/website/services/website";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const item = (await getContent("notices", (await params).slug))?.data;
  return { title: item?.title, description: item?.summary ?? undefined };
}
export default async function Page({ params }: Props) {
  return <ContentDetail resource="notices" slug={(await params).slug} />;
}
