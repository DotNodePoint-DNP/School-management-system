import type { ReactNode } from "react";
import { PortalWorker } from "@/components/PortalWorker";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PortalWorker />
      {children}
    </>
  );
}
