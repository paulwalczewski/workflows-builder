import Link from "next/link";
import { Suspense } from "react";
import { ActiveNavLinks, NavLinks } from "./NavLinks";

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-separator bg-background/90 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4"
      >
        <Link
          href="/"
          className="mr-auto truncate font-semibold tracking-tight"
        >
          <span className="sm:hidden">Workflows</span>
          <span className="hidden sm:inline">Subscription Workflows</span>
        </Link>
        {/* The active-link highlight depends on the URL, so it streams in after the static shell. */}
        <Suspense fallback={<NavLinks pathname={null} />}>
          <ActiveNavLinks />
        </Suspense>
      </nav>
    </header>
  );
}
