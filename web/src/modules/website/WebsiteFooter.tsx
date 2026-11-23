import Link from "next/link";
import { ArrowUpRight, BookOpen, MapPin } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api/client";
import { fallbackName, type Profile } from "./services/website";
import styles from "./WebsiteFooter.module.css";

const quickLinks = [
  ["About our school", "/about"],
  ["Academics", "/academics"],
  ["Notices", "/notices"],
  ["Events", "/events"],
  ["Careers", "/careers"],
  ["School portal", "/auth"],
] as const;

export default function WebsiteFooter({
  profile,
}: {
  profile?: Profile | null;
}) {
  const name = profile?.nameEn || fallbackName;
  const address = [
    profile?.tole,
    profile?.wardNo != null ? `Ward ${profile.wardNo}` : null,
    profile?.localLevel,
    profile?.district,
    profile?.province,
  ]
    .filter(Boolean)
    .join(", ");
  const location = address || profile?.addressLineNp;
  const query = location
    ? encodeURIComponent([name, location, "Nepal"].join(", "))
    : null;
  const year = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Kathmandu",
  }).format(new Date());
  return (
    <footer className={styles.footer}>
      <div className="site-wrap">
        <div className={styles.columns}>
          <div className={styles.identity}>
            <Link href="/" className={styles.brand}>
              {profile?.hasLogo ? (
                <img
                  src={getApiBaseUrl() + "/website/profile/logo"}
                  alt=""
                  width={64}
                  height={64}
                />
              ) : (
                <BookOpen aria-hidden="true" size={32} />
              )}
              <strong>{name}</strong>
            </Link>
            {profile?.nameNp && <p lang="ne">{profile.nameNp}</p>}
            {profile?.taglineEn && <p>{profile.taglineEn}</p>}
            {profile?.email && (
              <a href={"mailto:" + profile.email}>{profile.email}</a>
            )}
          </div>
          <nav aria-label="Footer quick links">
            <h2>Quick links</h2>
            <ul>
              {quickLinks.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <section>
            <h2>Campus</h2>
            {location && (
              <address lang={address ? undefined : "ne"}>{location}</address>
            )}
            <ul>
              <li>
                <Link href="/facilities">Facilities</Link>
              </li>
              <li>
                <Link href="/gallery">Gallery</Link>
              </li>
              <li>
                <Link href="/contact">Contact the school</Link>
              </li>
            </ul>
          </section>
          {query && (
            <div className={styles.map}>
              <iframe
                title={name + " campus map"}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={
                  "https://maps.google.com/maps?q=" + query + "&output=embed"
                }
              />
              <a
                href={
                  "https://www.google.com/maps/search/?api=1&query=" + query
                }
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={15} />
                Open in Google Maps <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </div>
        <div className={styles.credits}>
          <span>
            © {year} {name}. All rights reserved.
          </span>
          <span>
            Powered by <b>DotNotePoint</b>
          </span>
        </div>
      </div>
    </footer>
  );
}
