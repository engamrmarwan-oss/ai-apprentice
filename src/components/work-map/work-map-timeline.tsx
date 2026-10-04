import type { WorkMap, WorkMapRule, WorkMapStep } from "@/capture/debrief";
import { rulesForStep } from "./types";

export function WorkMapTimeline({
  map,
  onSelectRule,
  selectedRuleId,
}: {
  map: WorkMap;
  onSelectRule: (rule: WorkMapRule) => void;
  selectedRuleId: string | null;
}) {
  return (
    <section aria-labelledby="timeline-heading" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h2 className="text-lg font-bold tracking-[-0.02em]" id="timeline-heading">
            The workflow, step by step
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Every decision is tied to the screen Tiro saw and the expert’s own explanation.
          </p>
        </div>
        <span className="text-sm tabular-nums text-stone-500">
          {map.steps.length} {map.steps.length === 1 ? "step" : "steps"}
        </span>
      </div>

      {map.steps.length ? (
        <ol className="relative mt-7 space-y-7 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-stone-300">
          {map.steps.map((step) => (
            <TimelineStep
              key={step.id}
              onSelectRule={onSelectRule}
              rules={rulesForStep(map, step)}
              selectedRuleId={selectedRuleId}
              step={step}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-7 rounded-xl border border-dashed border-stone-300 p-5 text-sm leading-6 text-stone-600">
          This Work Map does not contain any steps yet.
        </p>
      )}
    </section>
  );
}

function TimelineStep({
  onSelectRule,
  rules,
  selectedRuleId,
  step,
}: {
  onSelectRule: (rule: WorkMapRule) => void;
  rules: WorkMapRule[];
  selectedRuleId: string | null;
  step: WorkMapStep;
}) {
  return (
    <li className="relative grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
      <span className="tiro-display relative z-10 grid size-10 place-items-center rounded-full border border-teal-800 bg-stone-50 text-base font-medium tabular-nums text-teal-900">
        {step.position}
      </span>
      <article className="min-w-0 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold tracking-[-0.02em] text-stone-950">
              {step.title}
            </h3>
            {step.is_judgment ? (
              <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Judgment step
              </span>
            ) : null}
          </div>
          {step.moment ? (
            <span className="font-mono text-xs tabular-nums text-stone-500">
              {clock(step.moment.t_ms)}
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(15rem,0.9fr)_minmax(0,1.1fr)]">
          <ScreenMoment step={step} />
          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
                Decision
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-800">
                {step.decision ?? step.moment?.what ?? "No decision recorded."}
              </p>
            </div>
            <figure className="border-t border-stone-200 pt-5">
              <figcaption className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
                Why
              </figcaption>
              <blockquote className="mt-2 border-l border-amber-500 bg-amber-50/60 px-4 py-3 text-base leading-6 italic text-stone-700">
                {step.reason ? `“${step.reason.text}”` : "The expert has not given a reason yet."}
              </blockquote>
            </figure>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-200 pt-4">
          <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
            Rules from this step
          </p>
          {rules.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {rules.map((rule) => (
                <button
                  aria-pressed={selectedRuleId === rule.id}
                  className={`rounded-md border px-3 py-2 text-left text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-700 ${
                    selectedRuleId === rule.id
                      ? "border-teal-800 bg-teal-50 text-teal-950"
                      : "border-stone-300 bg-white text-stone-700 hover:border-teal-400 hover:text-teal-950"
                  }`}
                  key={rule.id}
                  onClick={() => onSelectRule(rule)}
                  type="button"
                >
                  Rule {rule.number}: {rule.statement}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-stone-500">No rule is linked to this step.</p>
          )}
        </div>
      </article>
    </li>
  );
}

function ScreenMoment({ step }: { step: WorkMapStep }) {
  const moment = step.moment;
  const screen = moment?.screen;

  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-stone-300 bg-stone-100">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-3 py-2">
        <figcaption className="truncate text-xs font-semibold text-stone-700">
          {screen?.name ?? "Screen moment"}
        </figcaption>
        <span className="shrink-0 text-[0.6875rem] font-medium text-stone-500">
          {moment ? "Verified" : "Not captured"}
        </span>
      </div>
      {moment?.picture ? (
        // This short-lived signed address comes from Tiro's Work Map route.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={moment.what}
          className="aspect-video w-full bg-stone-100 object-cover object-top"
          src={moment.picture}
        />
      ) : (
        <div className="min-h-40 p-4">
          <p className="text-sm font-semibold text-stone-900">
            {screen?.item ?? moment?.what ?? "No screen moment is available."}
          </p>
          {screen?.fields.length ? (
            <dl className="mt-4 grid gap-2">
              {screen.fields.slice(0, 4).map((field) => (
                <div className="flex items-start justify-between gap-3 text-xs" key={field.name}>
                  <dt className="text-stone-500">{field.name}</dt>
                  <dd className="max-w-[60%] text-right font-medium text-stone-800">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      )}
      {moment?.picture && screen?.fields.length ? (
        <dl className="grid gap-2 border-t border-stone-200 bg-white p-3">
          {screen.fields.slice(0, 4).map((field) => (
            <div className="flex items-start justify-between gap-3 text-xs" key={field.name}>
              <dt className="text-stone-500">{field.name}</dt>
              <dd className="max-w-[60%] text-right font-medium text-stone-800">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </figure>
  );
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
