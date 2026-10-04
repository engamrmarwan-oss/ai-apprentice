import type { WorkMapRule } from "@/capture/debrief";

export function RuleDetail({ rule }: { rule: WorkMapRule }) {
  return (
    <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start" aria-labelledby="rule-detail-heading">
      <div className="tiro-shadow rounded-lg border border-stone-300 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={statusClass(rule.status)}>{label(rule.status)}</span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
            Rule {rule.number} · Version {rule.version}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rule.documented ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-900"}`}>
            {rule.documented ? "Documented" : "Captured from work"}
          </span>
        </div>

        <h2 className="tiro-display mt-5 text-2xl font-medium leading-8 tracking-[-0.02em]" id="rule-detail-heading">
          {rule.statement}
        </h2>

        <dl className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          <Detail label="Kind" value={label(rule.kind)} />
          <Detail label="Check" value={label(rule.check_type)} />
          <Detail label="Action" value={actionLabel(rule)} />
          <Detail label="Provenance" value={label(rule.provenance)} />
          <Detail label="Moment" value={label(rule.moment.link)} />
        </dl>

        {rule.moment.picture ? (
          <figure className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
            {/* This short-lived signed address comes from Tiro's Work Map route. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={rule.moment.what}
              className="aspect-video w-full object-cover object-top"
              src={rule.moment.picture}
            />
            <figcaption className="border-t border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600">
              {rule.moment.what}
            </figcaption>
          </figure>
        ) : null}

        <figure className="mt-6 border-l border-amber-500 bg-amber-50/60 p-4">
          <figcaption className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
            Expert evidence
          </figcaption>
          <blockquote className="mt-2 text-base leading-6 italic text-stone-700">
            “{rule.quote.text}”
          </blockquote>
        </figure>

        <section className="mt-7" aria-labelledby="version-history-heading">
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-semibold" id="version-history-heading">Version history</h3>
            <span className="text-xs tabular-nums text-stone-500">{rule.history.length}</span>
          </div>
          <ol className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
            {rule.history.map((version) => (
              <li className="py-3" key={`${rule.lineage_id}-${version.version}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">Version {version.version}</span>
                  <span className="text-xs text-stone-500">{label(version.status)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-600">{version.statement}</p>
                <time className="mt-1 block text-[0.6875rem] text-stone-500" dateTime={version.created_at}>
                  {formatDate(version.created_at)}
                </time>
              </li>
            ))}
          </ol>
        </section>

        <button
          className="mt-6 h-10 w-full cursor-not-allowed rounded-lg border border-stone-300 text-sm font-semibold text-stone-400"
          disabled
          title="Rule editing is available during the debrief."
          type="button"
        >
          Edit during debrief
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

function actionLabel(rule: WorkMapRule) {
  if (rule.action.type === "escalate") return `Escalate to ${rule.action.role}`;
  return label(rule.action.type);
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  const common = "rounded-full px-2.5 py-1 text-xs font-semibold";
  if (status === "confirmed" || status === "corrected") {
    return `${common} bg-teal-50 text-teal-900`;
  }
  return `${common} bg-amber-50 text-amber-900`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
