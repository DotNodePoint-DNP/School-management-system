import CollectionPage from "@/modules/website/CollectionPage";
import type { PageProps } from "@/modules/website/SectionPage";
export const metadata = { title: "Gallery" };
export default function Page(props: PageProps) {
  return <CollectionPage resource="gallery" {...props} />;
}
