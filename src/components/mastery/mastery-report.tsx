import type { MasteryOutcome, MasteryReport as TutorMasteryReport } from "@/capture/tutor";
import { practiseRules } from "./types";

export function MasteryReport({ report }: { report: TutorMasteryReport }) {
  const needsPractice = practiseRules(report);

  return (
    <div className="min-w-0">
      <section className="grid gap-7 border-b border-stone-200 pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="summary-heading">
        <div>
          <h2 className="tiro-display text-3xl font-medium tracking-[-0.02em]" id="summary-heading">
            {report.totals.passed_first_time} of {report.rules.length} rules passed first time
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            {summarySentence(report)}
          </p>
        </div>
        <dl className="grid grid-cols-2 border-y border-stone-200 sm:grid-cols-4 lg:border-y-0">
          <Metric label="First time" value={report.totals.passed_first_time} />
          <Metric label="Hint" value={report.totals.needed_hint} />
          <Metric label="Violated" value={report.totals.violated} />
          <Metric label="Not seen" value={report.totals.not_encountered} />
        </dl>
      </section>

      <section className="py-8" aria-labelledby="rule-outcomes-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-[-0.02em]" id="rule-outcomes-heading">
              Rule outcomes
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              What happened during this tutor session.
            </p>
          </div>
          <span className="text-sm tabular-nums text-stone-500">{report.rules.length}</span>
        </div>

        {report.rules.length ? (
          <ol className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
            {report.rules.map((rule) => (
              <li
                className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start"
                key={rule.rule_id}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-stone-500">
                    Rule {rule.number} · {label(rule.kind)}
                  </p>
                  <p className="mt-1 font-semibold leading-6 text-stone-950">
                    {rule.statement}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {outcomeExplanation(rule.outcome)}
                  </p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold sm:justify-self-end ${outcomeClass(rule.outcome)}`}>
                  {outcomeLabel(rule.outcome)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-stone-300 p-5 text-sm leading-6 text-stone-600">
            This report does not contain any rule outcomes.
          </p>
        )}
      </section>

      <section className="border-t-2 border-stone-950 pt-8" aria-labelledby="practise-next-heading">
        <h2 className="tiro-display text-2xl font-medium tracking-[-0.02em]" id="practise-next-heading">
          What to practise next
        </h2>
        {needsPractice.length ? (
          <ol className="mt-5 space-y-4">
            {needsPractice.map((rule, index) => (
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={rule.rule_id}>
                <span className="tiro-display grid size-8 place-items-center text-lg font-medium text-stone-500">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-stone-900">
                    Rule {rule.number}: {rule.statement}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">
                    {practiceExplanation(rule.outcome)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm leading-6 text-stone-600">
            No specific practice is needed from this run. Try another case to meet the rules in a different situation.
          </p>
        )}
      </section>
    </div>
  );
}

function Metric({ label: name, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-stone-200 px-4 py-3 first:border-l-0 lg:first:border-l">
      <dt className="text-[0.5625rem] font-bold tracking-[0.09em] text-stone-500 uppercase">{name}</dt>
      <dd className="tiro-display mt-1 text-xl font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function summarySentence(report: TutorMasteryReport) {
  const parts = [
    report.totals.needed_hint
      ? `${report.totals.needed_hint} needed a hint.`
      : "No hints were needed.",
    report.totals.violated
      ? `${report.totals.violated} ${report.totals.violated === 1 ? "rule was" : "rules were"} violated.`
      : "No rule was violated.",
    report.totals.not_encountered
      ? `${report.totals.not_encountered} ${report.totals.not_encountered === 1 ? "rule was" : "rules were"} not encountered.`
      : "Every rule was encountered.",
  ];
  return parts.join(" ");
}

function outcomeLabel(outcome: MasteryOutcome) {
  return {
    needed_hint: "Needed a hint",
    not_encountered: "Not encountered",
    passed_first_time: "Passed first time",
    violated: "Violated",
  }[outcome];
}

function outcomeExplanation(outcome: MasteryOutcome) {
  return {
    needed_hint: "Tiro caught the prediction before the action and explained the rule.",
    not_encountered: "The practice case did not present this rule.",
    passed_first_time: "You applied this rule independently on the first try.",
    violated: "The action on screen went against this rule.",
  }[outcome];
}

function practiceExplanation(outcome: MasteryOutcome) {
  if (outcome === "violated") return "Practise spotting the rule before acting on the next case.";
  if (outcome === "needed_hint") return "Explain the rule in your own words before choosing an action.";
  return "Try another case where this rule is likely to appear.";
}

function outcomeClass(outcome: MasteryOutcome) {
  if (outcome === "passed_first_time") return "bg-teal-50 text-teal-900";
  if (outcome === "violated") return "bg-red-50 text-red-800";
  if (outcome === "needed_hint") return "bg-amber-50 text-amber-900";
  return "bg-stone-100 text-stone-600";
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
