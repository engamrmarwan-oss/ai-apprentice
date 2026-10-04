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
          <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
            <header className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-7">
              <div>
                <p className="text-[0.625rem] font-bold tracking-[0.12em] text-stone-500 uppercase">{workflow.tool.name}</p>
                <h1 className="mt-2 max-w-3xl text-4xl leading-[1.12] font-medium tracking-[-0.025em] text-balance sm:text-[2.75rem]">
                {workflow.task}
                </h1>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1.5 text-[0.625rem] font-bold tracking-[0.05em] text-teal-900 uppercase">
                {workflow.role === "expert" ? "Expert" : "New hire"}
              </span>
            </header>

            <section className="grid gap-8 border-b border-stone-200 py-9 lg:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.55fr)] lg:items-center" aria-labelledby="next-step-heading">
              <div>
                <h2 className="tiro-display text-3xl font-medium tracking-[-0.02em]" id="next-step-heading">
                  {workflow.role === "expert" ? "Teach from the work itself." : "Practise with the evidence beside you."}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                  {workflow.role === "expert"
                    ? "Capture a real example, explain the decisions that matter, then review the Work Map Tiro builds from the evidence."
                    : "Open the Work Map to see the expert’s confirmed steps and rules, or start a tutor session to practise them."}
                </p>
                <Link
                  className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-900 px-5 text-xs font-bold text-white outline-none hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                  href={`/workflows/${encodeURIComponent(workflow.id)}/${workflow.role === "expert" ? "capture" : "tutor"}`}
                >
                  <Icon className="size-4" name={workflow.role === "expert" ? "record" : "sparkles"} />
                  {workflow.role === "expert" ? "Start capturing" : "Start tutor session"}
                </Link>
              </div>
              <div className="border-t border-stone-200 pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
                <p className="text-[0.625rem] font-bold tracking-[0.11em] text-stone-500 uppercase">Shared reference</p>
                <p className="tiro-display mt-2 text-2xl font-medium">The Work Map</p>
                <p className="mt-2 text-xs leading-5 text-stone-600">Every rule stays connected to the moment and explanation that produced it.</p>
                <Link className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-teal-900 underline decoration-teal-200 underline-offset-4" href={`/workflows/${encodeURIComponent(workflow.id)}/work-map`}>
                  Open Work Map <Icon className="size-3.5" name="arrow-right" />
                </Link>
              </div>
            </section>

            <section className="py-9" aria-labelledby="path-heading">
              <h2 className="text-lg font-bold tracking-[-0.02em]" id="path-heading">
                {workflow.role === "expert" ? "How to teach Tiro" : "How to learn this workflow"}
              </h2>
              <ol className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
                {(workflow.role === "expert" ? EXPERT_STEPS : NEW_HIRE_STEPS).map((step, index) => (
                  <li key={step.path}>
                    <Link className="group grid min-h-20 grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-700" href={`/workflows/${encodeURIComponent(workflow.id)}${step.path}`}>
                      <span className="tiro-display text-lg font-medium text-stone-500">{index + 1}</span>
                      <span className="min-w-0"><span className="block text-xs font-bold text-stone-900">{step.title}</span><span className="mt-1 block text-xs leading-5 text-stone-600">{step.detail}</span></span>
                      <Icon className="size-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-800" name="chevron-right" />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            {workflow.role === "expert" ? (
              <section className="flex flex-col gap-5 border-t-2 border-stone-950 py-8 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="learn-heading">
                <div><Icon className="size-5 text-blue-700" name="sparkles" /><h2 className="mt-3 text-lg font-bold" id="learn-heading">Practise it yourself</h2><p className="mt-2 max-w-xl text-xs leading-5 text-stone-600">Experts can use the same tutor and mastery views to test the learning experience.</p></div>
                <div className="flex gap-5 text-xs font-bold text-teal-900"><Link href={`/workflows/${encodeURIComponent(workflow.id)}/tutor`}>Open Tutor</Link><Link href={`/workflows/${encodeURIComponent(workflow.id)}/mastery`}>View Mastery</Link></div>
              </section>
            ) : null}
          </div>
        ) : null
      }
    </AuthenticatedApp>
  );
}
