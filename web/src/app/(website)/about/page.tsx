import SectionPage, { type PageProps } from "@/modules/website/SectionPage";
import { sections } from "@/modules/website/services/website";

export const metadata = {
  title: sections.about[0],
  description: sections.about[2],
};
export default function Page(props: PageProps) {
  return <SectionPage section="about" {...props} />;
}
