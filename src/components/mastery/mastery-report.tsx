import type { MasteryItem, MasteryReportFixture } from "./types";
import { masterySummary } from "./types";

export function MasteryReport({ report }: { report: MasteryReportFixture }) {
  const summary = masterySummary(report.items);
  const needsPractice = report.items.filter(
    (item) => item.check.outcome !== "passed_first_time",
  );

  return (
    <div className="min-w-0">
      <section className="border-b border-stone-200 pb-7" aria-labelledby="summary-heading">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="summary-heading">
          {summary.passed_first_time} of {report.items.length} rules passed first time
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          {summary.needed_hint > 0
            ? `${summary.needed_hint} needed a hint. `
            : "No hints were needed. "}
          {summary.violated > 0
            ? `${summary.violated} ${summary.violated === 1 ? "rule was" : "rules were"} violated. `
            : "No rule was violated. "}
          {summary.not_encountered > 0
            ? `${summary.not_encountered} ${summary.not_encountered === 1 ? "rule was" : "rules were"} not encountered.`
            : "Every rule was encountered."}
        </p>
      </section>

      <section className="py-8" aria-labelledby="rule-outcomes-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="rule-outcomes-heading">
              Rule outcomes
            </h2>
            <p className="mt-2 text-sm text-stone-600">What happened during this practice case.</p>
          </div>
          <span className="text-sm tabular-nums text-stone-500">{report.items.length}</span>
        </div>

        <ol className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
          {report.items.map((item) => (
            <RuleOutcome item={item} key={item.check.id} />
          ))}
        </ol>
      </section>

      <section className="border-t border-stone-200 pt-8" aria-labelledby="practise-next-heading">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="practise-next-heading">
          What to practise next
        </h2>
        {needsPractice.length ? (
          <ol className="mt-5 space-y-4">
            {needsPractice.map((item, index) => (
              <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3" key={item.check.id}>
                <span className="grid size-8 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-900">
                  {index + 1}
                </span>
                <div>
                  <p className="font-semibold text-stone-900">{item.rule.statement}</p>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{item.practiseNext}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm leading-6 text-stone-600">
            No specific practice is needed from this run. Try another case to test the rules in a different situation.
          </p>
        )}
      </section>
    </div>
  );
}

function RuleOutcome({ item }: { item: MasteryItem }) {
  return (
    <li className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start">
      <div className="min-w-0">
        <p className="font-semibold leading-6 text-stone-950">{item.rule.statement}</p>
        {item.check.prediction ? (
          <p className="mt-2 text-sm leading-6 text-stone-600">
            <span className="font-medium text-stone-800">Your prediction:</span>{" "}
            {item.check.prediction}
          </p>
        ) : (
          <p className="mt-2 text-sm leading-6 text-stone-500">
            This rule did not appear in the practice case.
          </p>
        )}
        {item.check.caught_before_commit !== null ? (
          <p className="mt-2 text-xs font-medium text-stone-500">
            {item.check.caught_before_commit
              ? "Caught before the action was committed"
              : "Caught after the action was committed"}
          </p>
        ) : null}
      </div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold sm:justify-self-end ${outcomeClass(item.check.outcome)}`}>
        {outcomeLabel(item.check.outcome)}
      </span>
    </li>
  );
}

function outcomeLabel(outcome: MasteryItem["check"]["outcome"]) {
  return {
    needed_hint: "Needed a hint",
    not_encountered: "Not encountered",
    passed_first_time: "Passed first time",
    violated: "Violated",
  }[outcome];
}

function outcomeClass(outcome: MasteryItem["check"]["outcome"]) {
  if (outcome === "passed_first_time") return "bg-teal-50 text-teal-900";
  if (outcome === "violated") return "bg-red-50 text-red-800";
  if (outcome === "needed_hint") return "bg-amber-50 text-amber-900";
  return "bg-stone-100 text-stone-600";
}
