import Link from "next/link";
import PublicForm from "@/modules/website/PublicForm";
import { getProfile } from "@/modules/website/services/website";
export const metadata = { title: "Contact" };
export default async function ContactPage() {
  const profile = await getProfile();
  return (
    <div className="site-wrap site-section">
      <p className="site-crumb">
        <Link href="/">Home</Link> / Contact
      </p>
      <h1>Contact us</h1>
      <div className="contact-layout">
        <aside className="site-facts">
          <h2>School office</h2>
          <p>{profile?.nameEn}</p>
          <p>
            {[profile?.localLevel, profile?.district]
              .filter(Boolean)
              .join(", ")}
          </p>
          {profile?.email && (
            <a href={"mailto:" + profile.email}>{profile.email}</a>
          )}
        </aside>
        <PublicForm />
      </div>
    </div>
  );
}
