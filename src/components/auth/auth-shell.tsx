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
    <main className="grid min-h-dvh bg-stone-50 text-stone-950 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(32rem,1.2fr)]">
      <section className="relative hidden overflow-hidden bg-teal-950 px-10 py-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-28 size-96 rounded-full border border-teal-700/50" />
        <div className="absolute top-24 -right-4 size-56 rounded-full border border-teal-700/40" />
        <Link
          className="relative flex w-fit items-center gap-2 rounded-lg text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-teal-950"
          href="/"
        >
          <span className="grid size-9 place-items-center rounded-full bg-white font-serif text-xl italic text-teal-950">
            t
          </span>
          Tiro
        </Link>

        <div className="relative my-auto max-w-lg py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-200 uppercase">
            Apprentice the work
          </p>
          <p className="mt-5 text-4xl leading-[1.1] font-semibold tracking-[-0.04em] text-balance xl:text-5xl">
            Capture how the work gets done—and why.
          </p>
          <p className="mt-6 max-w-md text-base leading-7 text-teal-100/80">
            Tiro watches an expert work, asks at the right moments, and turns
            what it learns into guidance for a new hire.
          </p>
        </div>

        <p className="relative text-xs text-teal-200/70">
          The work stays specific. The product stays flexible.
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <Link
            className="mb-10 flex w-fit items-center gap-2 rounded-lg text-xl font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-4 lg:hidden"
            href="/"
          >
            <span className="grid size-9 place-items-center rounded-full bg-teal-950 font-serif text-xl italic text-white">
              t
            </span>
            Tiro
          </Link>

          <p className="text-sm font-semibold text-teal-800">Welcome to Tiro</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-stone-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>

          <div className="mt-8">{children}</div>

          <p className="mt-8 text-sm text-stone-600">
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
