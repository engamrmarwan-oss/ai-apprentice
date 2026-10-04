"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type {
  DebriefView as EngineDebriefView,
  WorkMapRule,
  WorkMapStep,
} from "@/capture/debrief";
import type { Question } from "@/contract";
import { debriefPhaseLabel, openQuestionCount } from "./types";

type DebriefViewProps = {
  onBuild: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onDismiss: (questionId: string) => void;
  onEditRule: (number: number, statement: string) => Promise<void>;
  onEditStep: (
    position: number,
    change: { title?: string; decision?: string },
  ) => Promise<void>;
  onMute: () => void;
  view: EngineDebriefView;
};

export function DebriefView({
  onBuild,
  onConfirm,
  onDismiss,
  onEditRule,
  onEditStep,
  onMute,
  view,
}: DebriefViewProps) {
  const openItems = openQuestionCount(view);
  const canEdit = view.phase === "teach_back";

  return (
    <div className="min-w-0 space-y-8">
      <section
        aria-label="Debrief controls"
        className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center"
      >
        <div className="mr-auto">
          <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">
            Debrief
          </p>
          <p className="mt-1 font-semibold text-stone-900">{debriefPhaseLabel(view)}</p>
          <p className="mt-1 text-xs text-stone-500">
            Voice {view.voice} · {view.verified} verified · {view.doubted} doubted
          </p>
        </div>
        <button
          className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700"
          disabled={view.voice !== "on"}
          onClick={onMute}
          type="button"
        >
          {view.muted ? "Unmute" : "Mute"}
        </button>
        <button
          className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700"
          disabled={view.phase !== "asking"}
          onClick={() => void onBuild()}
          type="button"
        >
          I have answered
        </button>
        <button
          className="h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-not-allowed disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          disabled={!canEdit}
          onClick={() => void onConfirm()}
          type="button"
        >
          Confirm Work Map
        </button>
      </section>

      {view.problem ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">
          {view.problem}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <section
          className="min-w-0 rounded-2xl border border-stone-200 bg-white"
          aria-labelledby="conversation-heading"
        >
          <div className="flex items-center justify-between gap-3 border-b border-stone-200 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.025em]" id="conversation-heading">
                Conversation
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                {view.agentSpeaking ? "Tiro is speaking" : "Ordinary conversation"}
              </p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900">
              {view.phase.replaceAll("_", " ")}
            </span>
          </div>

          {view.spoken.length ? (
            <ol className="max-h-[34rem] space-y-5 overflow-y-auto p-5 sm:p-6" aria-label="Debrief transcript">
              {view.spoken.map((line) => {
                const agent = line.speaker === "agent";
                return (
                  <li className={`flex ${agent ? "justify-start" : "justify-end"}`} key={line.key}>
                    <div className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${agent ? "rounded-tl-sm bg-stone-100 text-stone-900" : "rounded-tr-sm bg-teal-900 text-white"}`}>
                      <div className={`flex items-center gap-2 text-xs font-semibold ${agent ? "text-stone-500" : "text-teal-100"}`}>
                        <span>{agent ? "Tiro" : "You"}</span>
                        <span aria-hidden="true">·</span>
                        <time>{clock(line.start_ms)}</time>
                      </div>
                      <p className="mt-1 text-sm leading-6">{line.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="p-6 text-sm leading-6 text-stone-500">
              The conversation will appear here after the debrief starts.
            </p>
          )}
        </section>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-8 xl:self-start">
          <Panel title="Questions Tiro will ask" detail={`${view.ask.length}`}>
            <QuestionList empty="No spoken questions are waiting." questions={view.ask} />
          </Panel>
          <Panel title="Also wondered about" detail={`${view.listed.length}`}>
            <QuestionList
              dismissible
              empty="No listed questions remain."
              onDismiss={onDismiss}
              questions={view.listed}
            />
          </Panel>
          <Panel title="Open items" detail={`${openItems}`}>
            <p className="text-sm leading-6 text-stone-600">
              {view.phase === "confirmed"
                ? "All required items are resolved and the Work Map is confirmed."
                : `${openItems} ${openItems === 1 ? "item is" : "items are"} still open before confirmation.`}
            </p>
          </Panel>
        </aside>
      </div>

      {view.workMap ? (
        <TeachBack
          canEdit={canEdit}
          onConfirm={onConfirm}
          onEditRule={onEditRule}
          onEditStep={onEditStep}
          view={view}
        />
      ) : (
        <section className="border-t border-stone-200 pt-8" aria-labelledby="teach-back-heading">
          <h2 className="text-3xl font-semibold tracking-[-0.035em]" id="teach-back-heading">
            Teach-back
          </h2>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Tiro will build the Work Map after the open questions are answered.
          </p>
        </section>
      )}
    </div>
  );
}

function TeachBack({
  canEdit,
  onConfirm,
  onEditRule,
  onEditStep,
  view,
}: {
  canEdit: boolean;
  onConfirm: () => Promise<void>;
  onEditRule: DebriefViewProps["onEditRule"];
  onEditStep: DebriefViewProps["onEditStep"];
  view: EngineDebriefView;
}) {
  const map = view.workMap;
  if (!map) return null;

  return (
    <section className="border-t border-stone-200 pt-8" aria-labelledby="teach-back-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.035em]" id="teach-back-heading">
            Here’s what Tiro learned
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Check every step and rule. Correct the text here or confirm the Work Map when it is right.
          </p>
        </div>
        <span className="text-sm text-stone-500">Version {map.version} · {map.status}</span>
      </div>

      <ol className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
        {map.steps.map((step) => {
          const rules = map.rules.filter((rule) => rule.steps.includes(step.position));
          return (
            <li className="grid gap-4 py-6 sm:grid-cols-[2rem_minmax(0,1fr)]" key={`${step.id}:${step.title}:${step.decision ?? ""}`}>
              <span className="grid size-8 place-items-center rounded-full bg-stone-100 text-sm font-bold text-stone-700">
                {step.position}
              </span>
              <div className="min-w-0">
                <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)]">
                  <div>
                    <h3 className="font-semibold text-stone-950">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      {step.decision ?? "No decision recorded."}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-stone-700">
                      {step.reason ? `“${step.reason.text}”` : "The expert has not given a reason yet."}
                    </p>
                  </div>
                  {step.moment?.picture ? (
                    // This short-lived signed address comes from Tiro's Work Map route.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={step.moment.what}
                      className="aspect-video w-full rounded-xl border border-stone-200 object-cover object-top"
                      src={step.moment.picture}
                    />
                  ) : null}
                </div>

                {rules.length ? (
                  <ul className="mt-4 space-y-3">
                    {rules.map((rule) => (
                      <li className="rounded-xl bg-stone-50 p-4" key={`${rule.id}:${rule.version}`}>
                        <p className="text-xs font-semibold text-stone-500">Rule {rule.number}</p>
                        <p className="mt-1 text-sm font-semibold leading-6 text-stone-900">{rule.statement}</p>
                        <p className="mt-2 text-xs leading-5 text-stone-600">“{rule.quote.text}”</p>
                        {canEdit ? <RuleEditor onSave={onEditRule} rule={rule} /> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canEdit ? <StepEditor onSave={onEditStep} step={step} /> : null}
              </div>
            </li>
          );
        })}
      </ol>

      {view.leftOut.length ? (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="left-out-heading">
          <h3 className="font-semibold text-amber-950" id="left-out-heading">Left out by validation</h3>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-amber-950">
            {view.leftOut.map((item, index) => (
              <li key={`${item.what}-${index}`}>
                <span className="font-semibold">{label(item.what)}:</span> {item.text}. {item.why}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        className="mt-6 h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-not-allowed disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        disabled={!canEdit}
        onClick={() => void onConfirm()}
        type="button"
      >
        Confirm Work Map
      </button>
    </section>
  );
}

function QuestionList({
  dismissible = false,
  empty,
  onDismiss,
  questions,
}: {
  dismissible?: boolean;
  empty: string;
  onDismiss?: (questionId: string) => void;
  questions: Question[];
}) {
  if (!questions.length) return <p className="text-sm leading-6 text-stone-500">{empty}</p>;
  return (
    <ol className="space-y-3">
      {questions.map((question, index) => (
        <li className="rounded-xl border border-stone-200 p-3" key={question.id}>
          <p className="text-xs font-semibold text-stone-500">Question {index + 1}</p>
          <p className="mt-1 text-sm leading-6 text-stone-900">{question.text}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-stone-500">
              {label(question.kind)} · {label(question.status)}
            </span>
            {dismissible && onDismiss ? (
              <button
                className="rounded px-2 py-1 text-xs font-semibold text-stone-600 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-teal-700"
                onClick={() => onDismiss(question.id)}
                type="button"
              >
                Dismiss
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepEditor({
  onSave,
  step,
}: {
  onSave: DebriefViewProps["onEditStep"];
  step: WorkMapStep;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(step.title);
  const [decision, setDecision] = useState(step.decision ?? "");

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave(step.position, { title: title.trim(), decision: decision.trim() });
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        className="mt-4 rounded px-2 py-1 text-xs font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700"
        onClick={() => setEditing(true)}
        type="button"
      >
        Correct step
      </button>
    );
  }

  return (
    <form className="mt-4 grid gap-3 rounded-xl border border-stone-200 p-4" onSubmit={(event) => void save(event)}>
      <label className="grid gap-1 text-xs font-semibold text-stone-600">
        Step title
        <input className="h-10 rounded-lg border border-stone-300 px-3 text-sm font-normal text-stone-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" onChange={(event) => setTitle(event.target.value)} required value={title} />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-stone-600">
        Decision
        <textarea className="min-h-24 rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" onChange={(event) => setDecision(event.target.value)} required value={decision} />
      </label>
      <div className="flex gap-2">
        <button className="h-9 rounded-lg bg-teal-900 px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Saving…" : "Save correction"}</button>
        <button className="h-9 rounded-lg px-3 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={() => setEditing(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}

function RuleEditor({
  onSave,
  rule,
}: {
  onSave: DebriefViewProps["onEditRule"];
  rule: WorkMapRule;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statement, setStatement] = useState(rule.statement);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave(rule.number, statement.trim());
    setSaving(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button className="mt-3 rounded px-2 py-1 text-xs font-semibold text-teal-800 outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-700" onClick={() => setEditing(true)} type="button">
        Correct rule
      </button>
    );
  }

  return (
    <form className="mt-3 grid gap-2" onSubmit={(event) => void save(event)}>
      <label className="grid gap-1 text-xs font-semibold text-stone-600">
        Rule statement
        <textarea className="min-h-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" onChange={(event) => setStatement(event.target.value)} required value={statement} />
      </label>
      <div className="flex gap-2">
        <button className="h-9 rounded-lg bg-teal-900 px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">{saving ? "Saving…" : "Save correction"}</button>
        <button className="h-9 rounded-lg px-3 text-xs font-semibold text-stone-600 hover:bg-white" onClick={() => setEditing(false)} type="button">Cancel</button>
      </div>
    </form>
  );
}

function Panel({ children, detail, title }: { children: ReactNode; detail?: string; title: string }) {
  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        {detail ? <span className="text-xs font-medium text-stone-500">{detail}</span> : null}
      </div>
      {children}
    </section>
  );
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
