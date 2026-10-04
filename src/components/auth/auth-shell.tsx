import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  alternateAction,
  alternateHref,
  alternatePrompt,
  children,
  description,
  title,
}: {
  alternateAction: string;
  alternateHref: string;
  alternatePrompt: string;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <main className="grid min-h-dvh bg-white text-stone-950 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-teal-900 px-12 py-10 text-white lg:flex lg:flex-col">
        <Link
          className="relative flex w-fit items-center gap-3 rounded-md text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-teal-900"
          href="/"
        >
          <span className="grid size-9 grid-cols-3 items-end gap-0.5 rounded-[48%_52%_46%_54%] border border-current px-2 py-2 [transform:rotate(-5deg)]">
            <span className="h-2 rounded-full bg-current [transform:rotate(-10deg)]" />
            <span className="h-4 rounded-full bg-current" />
            <span className="h-2.5 rounded-full bg-current [transform:rotate(12deg)]" />
          </span>
          Tiro
        </Link>

        <div className="relative my-auto max-w-lg py-20">
          <blockquote className="text-4xl leading-[1.28] font-medium tracking-[-0.025em] text-balance xl:text-[2.7rem]">
            “Show me the work. Tell me why. I’ll remember what matters.”
          </blockquote>
          <p className="mt-7 max-w-md text-sm leading-7 text-white/70">
            Tiro watches an expert work, asks at the right moments, and turns
            what it learns into guidance for a new hire.
          </p>
          <p className="mt-9 flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.12em] text-white/55 uppercase">
            <span>Observed</span><span className="h-px w-7 bg-white/35" />
            <span>Explained</span><span className="h-px w-7 bg-white/35" />
            <span>Learned</span>
          </p>
        </div>

        <p className="relative text-[0.625rem] text-white/60">
          Evidence-backed guidance for work that cannot be reduced to a checklist.
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center bg-white px-5 py-10 sm:px-8 lg:px-12">
        <div className="tiro-enter w-full max-w-sm">
          <Link
            className="mb-10 flex w-fit items-center gap-2 rounded-md text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-4 lg:hidden"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-full bg-teal-950 font-serif text-xl italic text-white">
              t
            </span>
            Tiro
          </Link>

          <h1 className="text-3xl font-medium tracking-[-0.025em] text-stone-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-xs leading-6 text-stone-600">{description}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-8 text-center text-xs text-stone-600">
            {alternatePrompt}{" "}
            <Link
              className="font-semibold text-teal-800 underline decoration-teal-300 underline-offset-4 outline-none hover:text-teal-950 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-teal-700"
              href={alternateHref}
            >
              {alternateAction}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
