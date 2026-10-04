"use client";

import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { NewWorkflowForm } from "./new-workflow-form";

export function NewWorkflowClient() {
  return (
    <AuthenticatedApp>
      {() => (
        <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
          <header className="border-b border-stone-200 pb-7">
            <p className="text-sm font-semibold text-teal-800">New workflow</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
              What should Tiro learn?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
              Start with one task in one tool. You’ll teach Tiro the decisions and
              guardrails by working through real examples.
            </p>
          </header>
          <NewWorkflowForm />
        </div>
      )}
    </AuthenticatedApp>
  );
}
