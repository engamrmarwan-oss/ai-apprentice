"use client";

import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { MasteryReport } from "@/components/mastery/mastery-report";
import { masteryReportFixture } from "@/fixtures/mastery-report";

export function MasteryClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {() => (
        <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
          <header className="flex flex-col gap-5 border-b border-stone-200 pb-9 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                Mastery report
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
                See which expert rules you applied independently and where another practice case will help.
              </p>
            </div>
            <div className="text-sm text-stone-500 sm:text-right">
              <p className="font-semibold text-stone-700">{masteryReportFixture.runLabel}</p>
              <p className="mt-1">{formatDate(masteryReportFixture.completedAt)} · Preview data</p>
            </div>
          </header>
          <div className="py-9">
            <MasteryReport report={masteryReportFixture} />
          </div>
        </div>
      )}
    </AuthenticatedApp>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
