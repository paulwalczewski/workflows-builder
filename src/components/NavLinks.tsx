"use client";

import { buttonVariants } from "@heroui/styles";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/portal", label: "Customer portal", short: "Portal" },
  { href: "/builder", label: "Workflow builder", short: "Builder" },
];

function isActive(pathname: string | null, href: string) {
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export function NavLinks({ pathname }: { pathname: string | null }) {
  return links.map((link) => {
    const active = isActive(pathname, link.href);
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={buttonVariants({
          size: "sm",
          variant: active ? "primary" : "ghost",
        })}
      >
        <span className="sm:hidden">{link.short}</span>
        <span className="hidden sm:inline">{link.label}</span>
      </Link>
    );
  });
}

export function ActiveNavLinks() {
  return <NavLinks pathname={usePathname()} />;
}
