"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export default function WebsiteNavigation({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <nav aria-label="Main navigation" className="site-nav">
      <button
        className="site-menu"
        aria-expanded={open}
        aria-controls="school-links"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={18} /> : <Menu size={18} />} Menu
      </button>
      <div
        id="school-links"
        className={open ? "site-links expanded" : "site-links"}
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={path === link.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
