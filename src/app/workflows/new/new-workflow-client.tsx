"use client";

import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { NewWorkflowForm } from "./new-workflow-form";

export function NewWorkflowClient() {
  return (
    <AuthenticatedApp>
      {() => (
        <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
          <header className="border-b border-stone-200 pb-7">
            <h1 className="text-4xl font-medium tracking-[-0.025em] text-balance sm:text-[2.75rem]">
              What should Tiro learn?
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600">
              Start with one task in one tool. You’ll teach Tiro the decisions and
              guardrails by working through real examples.
            </p>
          </header>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
            <NewWorkflowForm />
            <aside className="mt-8 border-t border-stone-200 pt-7 lg:border-t-0 lg:border-l lg:pl-8">
              <p className="text-[0.625rem] font-bold tracking-[0.11em] text-stone-500 uppercase">What happens next</p>
              <ol className="mt-5 space-y-6">
                <li className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="tiro-display text-lg text-stone-500">1</span><div><p className="text-xs font-bold">Set the context</p><p className="mt-1 text-xs leading-5 text-stone-600">Give Tiro a baseline and map the tool before capture.</p></div></li>
                <li className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="tiro-display text-lg text-stone-500">2</span><div><p className="text-xs font-bold">Work a real example</p><p className="mt-1 text-xs leading-5 text-stone-600">Tiro watches the screen and asks why at useful moments.</p></div></li>
                <li className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="tiro-display text-lg text-stone-500">3</span><div><p className="text-xs font-bold">Confirm the Work Map</p><p className="mt-1 text-xs leading-5 text-stone-600">Review the evidence-backed rules before anyone learns them.</p></div></li>
              </ol>
            </aside>
          </div>
        </div>
      )}
    </AuthenticatedApp>
  );
}
