import Link from "next/link";
import { BookOpen, ArrowUpRight } from "lucide-react";
import WebsiteFooter from "@/modules/website/WebsiteFooter";
import WebsiteNavigation from "@/modules/website/WebsiteNavigation";
import {
  fallbackName,
  getProfile,
  sections,
} from "@/modules/website/services/website";
import "./website.css";
import "@/modules/website/public-content.css";

export async function generateMetadata() {
  const profile = await getProfile();
  const name = profile?.nameEn || fallbackName;
  return {
    title: { default: name, template: "%s | " + name },
    description:
      "School information, academics, notices and events from " + name,
  };
}
export default async function WebsiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  const name = profile?.nameEn || fallbackName;
  const links = [
    { href: "/", label: "Home" },
    ...Object.entries(sections).map(([key, value]) => ({
      href: "/" + key,
      label: value[0],
    })),
  ];
  return (
    <div className="public-school">
      <a className="site-skip" href="#site-main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-wrap site-mast">
          <Link href="/" className="site-brand">
            <span className="site-mark">
              <BookOpen size={25} />
            </span>
            {name}
          </Link>
          <Link href="/auth" className="site-portal">
            School portal <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="site-wrap">
          <WebsiteNavigation links={links} />
        </div>
      </header>
      <main id="site-main">{children}</main>
      <WebsiteFooter profile={profile} />
    </div>
  );
}
