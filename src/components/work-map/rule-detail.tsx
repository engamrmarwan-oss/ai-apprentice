import type { Rule } from "@/contract";
import type { WorkMapStepItem } from "./types";

export function RuleDetail({
  history,
  rule,
  step,
}: {
  history: Rule[];
  rule: Rule;
  step: WorkMapStepItem;
}) {
  const quote = step.reason.text_english ?? step.reason.text_original;

  return (
    <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start" aria-labelledby="rule-detail-heading">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusClass(rule.status)}>{label(rule.status)}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
            Version {rule.version}
          </span>
          {rule.documented ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
              Documented
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Captured from work
            </span>
          )}
        </div>

        <h2 className="mt-5 text-2xl font-semibold leading-8 tracking-[-0.03em]" id="rule-detail-heading">
          {rule.statement}
        </h2>

        <dl className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          <Detail label="Kind" value={label(rule.kind)} />
          <Detail label="Check" value={rule.check_type === "judged" ? "Judged from context" : "Deterministic check"} />
          <Detail label="Action" value={actionLabel(rule)} />
          <Detail label="Provenance" value={label(rule.provenance)} />
        </dl>

        {rule.check_type === "judged" ? (
          <section className="mt-6" aria-labelledby="judge-question-heading">
            <h3 className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase" id="judge-question-heading">
              What Tiro evaluates
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-800">{rule.judge_spec.question}</p>
          </section>
        ) : (
          <section className="mt-6" aria-labelledby="structured-check-heading">
            <h3 className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase" id="structured-check-heading">
              How Tiro checks it
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              A structured condition checks values from the mapped tool screen.
            </p>
          </section>
        )}

        <figure className="mt-6 rounded-xl bg-stone-50 p-4">
          <figcaption className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
            Expert evidence
          </figcaption>
          <blockquote className="mt-2 text-sm leading-6 text-stone-700">“{quote}”</blockquote>
          <p className="mt-3 text-xs font-medium text-stone-500">From: {step.step.title}</p>
        </figure>

        <section className="mt-7" aria-labelledby="version-history-heading">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-semibold" id="version-history-heading">Version history</h3>
            <span className="text-xs tabular-nums text-stone-500">{history.length}</span>
          </div>
          <ol className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
            {[...history].reverse().map((version) => (
              <li className="py-3" key={version.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Version {version.version}</span>
                  <span className="text-xs text-stone-500">{label(version.status)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-600">{version.statement}</p>
              </li>
            ))}
          </ol>
        </section>

        <button
          className="mt-6 h-10 w-full cursor-not-allowed rounded-lg border border-stone-300 text-sm font-semibold text-stone-400"
          disabled
          title="Rule editing will be enabled when the rule routes are live."
          type="button"
        >
          Edit rule · Coming with live routes
        </button>
      </div>
    </aside>
  );
}

function Detail({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-3 text-sm">
      <dt className="text-stone-500">{name}</dt>
      <dd className="font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function actionLabel(rule: Rule) {
  if (rule.action.type === "escalate") return `Escalate to ${rule.action.role}`;
  return label(rule.action.type);
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function statusClass(status: Rule["status"]) {
  const common = "rounded-full px-2.5 py-1 text-xs font-semibold";
  if (status === "confirmed" || status === "corrected") {
    return `${common} bg-teal-50 text-teal-900`;
  }
  if (status === "rejected" || status === "retired") {
    return `${common} bg-stone-100 text-stone-600`;
  }
  return `${common} bg-amber-50 text-amber-900`;
}
