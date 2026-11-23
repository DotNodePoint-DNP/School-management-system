import SectionPage, { type PageProps } from "@/modules/website/SectionPage";
import { sections } from "@/modules/website/services/website";

export const metadata = {
  title: sections.academics[0],
  description: sections.academics[2],
};
export default function Page(props: PageProps) {
  return <SectionPage section="academics" {...props} />;
}
