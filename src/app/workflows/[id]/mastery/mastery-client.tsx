"use client";

import Link from "next/link";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";

export function MasteryClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {() => (
        <div className="mx-auto grid min-h-[70dvh] max-w-2xl place-items-center px-6 py-12 text-center">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              Mastery report
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600">
              Your report is created from the tutor engine’s final view. Finish a tutor session to see every rule outcome and what to practise next.
            </p>
            <Link
              className="mt-7 inline-flex h-11 items-center justify-center rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              href={`/workflows/${encodeURIComponent(workflowId)}/tutor`}
            >
              Start a tutor session
            </Link>
          </div>
        </div>
      )}
    </AuthenticatedApp>
  );
}
