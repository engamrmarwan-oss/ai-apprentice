import type { Rule } from "@/contract";
import { describeEvent } from "@/conductor/describe";
import { frameReading, type WorkMapFixture, type WorkMapStepItem } from "./types";

export function WorkMapTimeline({
  map,
  onSelectRule,
  selectedRuleId,
}: {
  map: WorkMapFixture;
  onSelectRule: (rule: Rule, step: WorkMapStepItem) => void;
  selectedRuleId: string | null;
}) {
  return (
    <section aria-labelledby="timeline-heading" className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="timeline-heading">
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

      <ol className="relative mt-7 space-y-8 before:absolute before:top-5 before:bottom-5 before:left-5 before:w-px before:bg-stone-300">
        {map.steps.map((item) => (
          <TimelineStep
            item={item}
            key={item.step.id}
            onSelectRule={onSelectRule}
            selectedRuleId={selectedRuleId}
          />
        ))}
      </ol>
    </section>
  );
}

function TimelineStep({
  item,
  onSelectRule,
  selectedRuleId,
}: {
  item: WorkMapStepItem;
  onSelectRule: (rule: Rule, step: WorkMapStepItem) => void;
  selectedRuleId: string | null;
}) {
  return (
    <li className="relative grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
      <span className="relative z-10 grid size-10 place-items-center rounded-full border border-teal-800 bg-stone-50 text-sm font-bold tabular-nums text-teal-900">
        {item.step.position}
      </span>
      <article className="min-w-0 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.025em] text-stone-950">
              {item.step.title}
            </h3>
            {item.step.is_judgment ? (
              <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Judgment step
              </span>
            ) : null}
          </div>
          <span className="font-mono text-xs tabular-nums text-stone-500">
            {clock(item.event.t_ms)}
          </span>
        </div>

        <div className="mt-5 grid min-w-0 gap-5 2xl:grid-cols-[minmax(15rem,0.9fr)_minmax(0,1.1fr)]">
          <ScreenMoment item={item} />
          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
                Decision
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-800">
                {item.step.decision ?? describeEvent(item.event)}
              </p>
            </div>
            <figure className="border-t border-stone-200 pt-5">
              <figcaption className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
                Why
              </figcaption>
              <blockquote className="mt-2 text-sm leading-6 text-stone-700">
                “{item.reason.text_english ?? item.reason.text_original}”
              </blockquote>
            </figure>
          </div>
        </div>

        <div className="mt-5 border-t border-stone-200 pt-4">
          <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
            Rules from this step
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.rules.map((rule) => (
              <button
                aria-pressed={selectedRuleId === rule.id}
                className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-700 ${
                  selectedRuleId === rule.id
                    ? "border-teal-800 bg-teal-50 text-teal-950"
                    : "border-stone-300 bg-white text-stone-700 hover:border-teal-400 hover:text-teal-950"
                }`}
                key={rule.id}
                onClick={() => onSelectRule(rule, item)}
                type="button"
              >
                {rule.statement}
              </button>
            ))}
          </div>
        </div>
      </article>
    </li>
  );
}

function ScreenMoment({ item }: { item: WorkMapStepItem }) {
  const reading = frameReading(item.frame);

  return (
    <figure className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-3 py-2">
        <figcaption className="truncate text-xs font-semibold text-stone-700">
          {reading?.screen ?? "Screen moment"}
        </figcaption>
        <span className="shrink-0 text-[0.6875rem] font-medium text-stone-500">
          Verified
        </span>
      </div>
      <div className="min-h-40 p-4">
        <p className="truncate text-sm font-semibold text-stone-900">
          {reading?.item ?? describeEvent(item.event)}
        </p>
        {reading?.fields.length ? (
          <dl className="mt-4 grid gap-2">
            {reading.fields.slice(0, 3).map((field) => (
              <div className="flex items-start justify-between gap-3 text-xs" key={field.name}>
                <dt className="text-stone-500">{field.name}</dt>
                <dd className="max-w-[60%] text-right font-medium text-stone-800">{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-xs leading-5 text-stone-500">{describeEvent(item.event)}</p>
        )}
      </div>
    </figure>
  );
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
