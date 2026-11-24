import type { Metadata } from "next";
import { PortalInstall } from "@/components/PortalInstall";
import { RoleLogin } from "@/modules/auth/components/RoleLogin";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pathivara Portal" },
  icons: { apple: "/icons/portal-180.png" },
  title: "Sign in | Pathivara vidhya mandir",
  description: "Sign in to the Pathivara vidhya mandir school portal.",
};

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const checking = (await searchParams)["install-check"] === "1";
  return (
    <>
      {/* Brave can offer installation before React hydrates the sign-in page. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
        window.addEventListener("beforeinstallprompt", function capture(event) {
          if (location.pathname !== "/auth" && location.pathname !== "/auth/") return;
          event.preventDefault();
          window.schoolPortalInstallOffer = event;
        }, { once: true });
      `,
        }}
      />
      <PortalInstall checking={checking} />
      <RoleLogin />
    </>
  );
}
