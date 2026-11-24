import SectionPage, { type PageProps } from "@/modules/website/SectionPage";
import { sections } from "@/modules/website/services/website";

export const metadata = {
  title: sections.facilities[0],
  description: sections.facilities[2],
};
export default function Page(props: PageProps) {
  return <SectionPage section="facilities" {...props} />;
}
