"use client";

import Link from "next/link";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { Icon } from "@/components/ui/icon";

const EXPERT_STEPS = [
  { path: "/setup", title: "Set up", detail: "Give Tiro your written process, so it knows what to expect before it watches." },
  { path: "/capture", title: "Capture", detail: "Do the task on a real example and think aloud while Tiro watches." },
  { path: "/debrief", title: "Debrief", detail: "Answer Tiro’s questions, check what it learned and confirm the Work Map." },
  { path: "/people", title: "Invite new hires", detail: "Add the people who should learn this workflow." },
];

const NEW_HIRE_STEPS = [
  { path: "/work-map", title: "Read the Work Map", detail: "The expert’s steps, and the rules behind them in their own words." },
  { path: "/tutor", title: "Practise with the tutor", detail: "Work a case while Tiro checks your choices against the expert’s rules." },
  { path: "/mastery", title: "See your mastery report", detail: "How you did on each rule, and what to practise next." },
];

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
                {workflow.role === "expert" ? "How to teach Tiro" : "How to learn this workflow"}
              </h2>
              <ol className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
                {(workflow.role === "expert" ? EXPERT_STEPS : NEW_HIRE_STEPS).map((step, index) => (
                  <li key={step.path}>
                    <Link
                      className="group flex items-center gap-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                      href={`/workflows/${encodeURIComponent(workflow.id)}${step.path}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-900">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-stone-900">{step.title}</span>
                        <span className="mt-0.5 block text-sm leading-6 text-stone-600">{step.detail}</span>
                      </span>
                      <Icon
                        className="size-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-800"
                        name="chevron-right"
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null
      }
    </AuthenticatedApp>
  );
}
