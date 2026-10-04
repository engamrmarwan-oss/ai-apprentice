"use client";

import { useState } from "react";
import type { Rule } from "@/contract";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { RuleDetail } from "@/components/work-map/rule-detail";
import { WorkMapTimeline } from "@/components/work-map/work-map-timeline";
import type { WorkMapStepItem } from "@/components/work-map/types";
import { workMapFixture } from "@/fixtures/work-map";

type Selection = { rule: Rule; step: WorkMapStepItem };

export function WorkMapClient({ workflowId }: { workflowId: string }) {
  const firstStep = workMapFixture.steps[0];
  const firstRule = firstStep?.rules[0];
  const [selection, setSelection] = useState<Selection | null>(
    firstStep && firstRule ? { rule: firstRule, step: firstStep } : null,
  );

  return (
    <AuthenticatedApp workflowId={workflowId}>
      {() => (
        <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
          <header className="flex flex-col gap-5 border-b border-stone-200 pb-9 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
                Work Map
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
                A confirmed record of the steps, decisions, reasons, and rules the expert demonstrated.
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm text-stone-600">
              <span className="rounded-full bg-teal-50 px-3 py-1.5 font-semibold text-teal-900">
                {workMapFixture.workMap.status}
              </span>
              <span>Version {workMapFixture.workMap.version} · Preview data</span>
            </div>
          </header>

          <div className="grid min-w-0 gap-10 py-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
            <WorkMapTimeline
              map={workMapFixture}
              onSelectRule={(rule, step) => setSelection({ rule, step })}
              selectedRuleId={selection?.rule.id ?? null}
            />
            {selection ? (
              <RuleDetail
                history={workMapFixture.ruleHistory[selection.rule.lineage_id] ?? [selection.rule]}
                rule={selection.rule}
                step={selection.step}
              />
            ) : (
              <aside className="rounded-2xl border border-dashed border-stone-300 p-6 text-sm leading-6 text-stone-600">
                Select a rule in the timeline to inspect its evidence and history.
              </aside>
            )}
          </div>
        </div>
      )}
    </AuthenticatedApp>
  );
}
