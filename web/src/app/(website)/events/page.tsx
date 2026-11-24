import CollectionPage from "@/modules/website/CollectionPage";
import type { PageProps } from "@/modules/website/SectionPage";
export const metadata = { title: "Events" };
export default function Page(props: PageProps) {
  return <CollectionPage resource="events" {...props} />;
}
