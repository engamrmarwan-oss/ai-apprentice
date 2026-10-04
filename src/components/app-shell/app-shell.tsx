"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { getNavigation, type OpenWorkflow } from "./navigation";

export type AccountUser = {
  email: string;
  id: string;
  name: string;
};

export function AppShell({
  children,
  user,
  workflow,
}: {
  children: ReactNode;
  user: AccountUser;
  workflow?: OpenWorkflow;
}) {
  const pathname = usePathname();
  const navigation = getNavigation(workflow);
  const navRef = useRef<HTMLElement>(null);

  // On a phone the navigation is a strip that scrolls sideways: bring the current page into it.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const box = current.getBoundingClientRect();
    nav.scrollLeft += box.left - navBox.left - (navBox.width - box.width) / 2;
  }, [pathname]);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-stone-50 text-stone-950 md:grid md:grid-cols-[15.75rem_minmax(0,1fr)] md:overflow-x-visible">
      <aside className="min-w-0 overflow-x-hidden border-b border-white/10 bg-teal-900 text-white md:sticky md:top-0 md:h-dvh md:overflow-x-visible md:border-r-0 md:border-b-0">
        <div className="flex h-full min-w-0 flex-col px-3 py-4 md:py-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              className="flex w-fit items-center gap-2.5 rounded-md px-2 py-1 text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-teal-900"
              href="/"
            >
              <TiroMark />
              <span>
                <span className="block leading-5">Tiro</span>
                <span className="block text-[0.5625rem] font-semibold tracking-[0.12em] text-white/60 uppercase">
                  Apprentice the work
                </span>
              </span>
            </Link>
            <div className="md:hidden">
              <AccountMenu compact user={user} />
            </div>
          </div>

          {workflow ? (
            <div className="mt-5 hidden rounded-lg border border-white/15 bg-white/[0.06] p-2.5 md:grid md:grid-cols-[2.25rem_minmax(0,1fr)] md:items-center md:gap-2.5">
              <span className="grid size-9 place-items-center rounded-md bg-amber-50 text-[0.6875rem] font-extrabold tracking-[0.06em] text-teal-950">
                {workflow.tool.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.625rem] text-white/55">
                  {workflow.tool.name}
                </span>
                <span className="mt-1 block truncate text-[0.6875rem] font-semibold text-white">
                  {workflow.task}
                </span>
              </span>
            </div>
          ) : null}

          <nav
            aria-label="Primary navigation"
            ref={navRef}
            className="mt-4 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto pb-1 md:mt-5 md:block md:space-y-4 md:overflow-visible"
          >
            {navigation.map((group) => (
              <div className="shrink-0 md:block" key={group.label}>
                <p className="sr-only md:not-sr-only md:mb-1 md:px-2.5 md:text-[0.5625rem] md:font-bold md:tracking-[0.14em] md:text-white/60 md:uppercase">
                  {group.label}
                </p>
                <div className="flex gap-1 md:block md:space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-xs whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/80 ${
                          active
                            ? "bg-stone-50 font-bold text-teal-950"
                            : "text-white/70 hover:bg-white/[0.08] hover:text-white"
                        }`}
                        href={item.href}
                        key={item.href}
                      >
                        <Icon className="size-[1.125rem]" name={item.icon} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto hidden border-t border-white/10 pt-3 md:block">
            <AccountMenu user={user} />
          </div>
        </div>
      </aside>
      <main className="min-w-0 bg-stone-50">{children}</main>
    </div>
  );
}

function AccountMenu({
  compact = false,
  user,
}: {
  compact?: boolean;
  user: AccountUser;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  async function signOut() {
    setError(null);
    setIsSigningOut(true);

    try {
      const response = await fetch("/api/auth/sign-out", {
        credentials: "same-origin",
        method: "POST",
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Tiro couldn’t sign you out. Try again.";
        setError(message);
        setIsSigningOut(false);
        return;
      }

      detailsRef.current?.removeAttribute("open");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Tiro couldn’t sign you out. Check your connection and try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <details className="relative" ref={detailsRef}>
      <summary
        aria-label={`Open account menu for ${user.name}`}
        className={`flex cursor-pointer list-none items-center gap-3 rounded-lg outline-none hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-white/80 ${
          compact ? "p-1" : "w-full px-2 py-2"
        }`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-50 text-xs font-bold text-teal-950">
          {initials || user.name.slice(0, 1).toUpperCase()}
        </span>
        {compact ? null : (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-xs font-semibold text-white">
              {user.name}
            </span>
            <span className="mt-0.5 block truncate text-[0.625rem] text-white/60">
              {user.email}
            </span>
          </span>
        )}
      </summary>
      <div className="absolute right-0 bottom-auto z-50 mt-2 w-72 rounded-lg border border-stone-300 bg-white p-2 text-stone-950 shadow-[0_18px_45px_rgba(24,33,30,0.18)] md:right-auto md:bottom-full md:left-0 md:mt-0 md:mb-2 md:w-64">
        <div className="border-b border-stone-200 px-3 py-2.5">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="mt-1 truncate text-xs text-stone-500">{user.email}</p>
        </div>
        <button
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-stone-700 outline-none hover:bg-stone-100 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-teal-700"
          disabled={isSigningOut}
          onClick={() => void signOut()}
          type="button"
        >
          <Icon className="size-4" name="log-out" />
          {isSigningOut ? "Signing out…" : "Sign out"}
        </button>
        {error ? (
          <p aria-live="polite" className="px-3 pt-2 pb-1 text-xs leading-5 text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function TiroMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 grid-cols-3 items-end gap-0.5 rounded-[48%_52%_46%_54%] border border-current px-2 py-2 [transform:rotate(-5deg)]"
    >
      <span className="h-2 rounded-full bg-current [transform:rotate(-10deg)]" />
      <span className="h-4 rounded-full bg-current" />
      <span className="h-2.5 rounded-full bg-current [transform:rotate(12deg)]" />
    </span>
  );
}
