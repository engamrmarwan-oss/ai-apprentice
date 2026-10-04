"use client";

import Link from "next/link";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { Icon } from "@/components/ui/icon";

export function WorkflowOverviewClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow ? (
          <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
            <header className="border-b border-stone-200 pb-9">
              <p className="text-sm font-semibold text-teal-800">Workflow overview</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                {workflow.task}
              </h1>
              <p className="mt-4 text-base text-stone-600">{workflow.tool.name}</p>
            </header>

            <section className="py-9" aria-labelledby="next-step-heading">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="next-step-heading">
                Next step
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                {workflow.role === "expert"
                  ? "Capture a real example so Tiro can begin learning how you make decisions."
                  : "Open the Work Map to see the expert’s confirmed steps and rules."}
              </p>
              <Link
                className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
                href={`/workflows/${encodeURIComponent(workflow.id)}/${workflow.role === "expert" ? "capture" : "work-map"}`}
              >
                <Icon className="size-4" name={workflow.role === "expert" ? "record" : "map"} />
                {workflow.role === "expert" ? "Start capturing" : "Open Work Map"}
              </Link>
            </section>
          </div>
        ) : null
      }
    </AuthenticatedApp>
  );
}
