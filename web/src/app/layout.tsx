import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";
import { NetworkStatus } from "@/components/NetworkStatus";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/features/theme/Theme-provider";

export const metadata: Metadata = {
  title: "Pathivara vidhya mandir | Make room for wonder",
  description:
    "Pathivara vidhya mandir is an independent day school for curious, thoughtful young people.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
        </ThemeProvider>
          <NetworkStatus />
          <Toaster position="top-right" richColors closeButton />
          <PwaRegister />
      </body>
    </html>
  );
}
