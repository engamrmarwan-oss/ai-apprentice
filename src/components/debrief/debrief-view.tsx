import type { ReactNode } from "react";
import { describeEvent } from "@/conductor/describe";
import type { Question } from "@/contract";
import type { DebriefFixture } from "./types";
import {
  answeredQuestionCount,
  floorLabel,
  openDebriefQuestions,
} from "./types";

type DebriefViewProps = {
  notice: string | null;
  onConfirm: () => void;
  onCorrect: () => void;
  onSelectQuestion: (questionId: string) => void;
  report: DebriefFixture;
  selectedQuestionId: string | null;
};

export function DebriefView({
  notice,
  onConfirm,
  onCorrect,
  onSelectQuestion,
  report,
  selectedQuestionId,
}: DebriefViewProps) {
  const openQuestions = openDebriefQuestions(report.questions);
  const answered = answeredQuestionCount(report.questions);
  const total = answered + openQuestions.length;

  return (
    <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,0.7fr)]">
      <div className="min-w-0 space-y-8">
        <section
          className="rounded-2xl border border-stone-200 bg-white"
          aria-labelledby="conversation-heading"
        >
          <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-teal-800 uppercase">
                Floor
              </p>
              <h2
                className="mt-1 text-xl font-semibold tracking-[-0.025em]"
                id="conversation-heading"
              >
                {floorLabel(report.floor)}
              </h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900">
              <span className="size-2 animate-pulse rounded-full bg-teal-600" />
              Conversation open
            </span>
          </div>

          <ol className="space-y-5 p-5 sm:p-6" aria-label="Debrief transcript">
            {report.utterances.map((utterance) => {
              const agent = utterance.speaker === "agent";
              return (
                <li
                  className={`flex ${agent ? "justify-start" : "justify-end"}`}
                  key={utterance.id}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${
                      agent
                        ? "rounded-tl-sm bg-stone-100 text-stone-900"
                        : "rounded-tr-sm bg-teal-900 text-white"
                    }`}
                  >
                    <div className={`flex items-center gap-2 text-xs font-semibold ${agent ? "text-stone-500" : "text-teal-100"}`}>
                      <span>{agent ? "Tiro" : "You"}</span>
                      <span aria-hidden="true">·</span>
                      <time>{clock(utterance.start_ms)}</time>
                    </div>
                    <p className="mt-1 text-sm leading-6">{utterance.text_original}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {report.partial ? (
            <div className="border-t border-stone-200 px-5 py-4 sm:px-6" aria-live="polite">
              <p className="text-xs font-semibold text-stone-500 uppercase">Hearing</p>
              <p className="mt-1 border-l-2 border-teal-400 pl-3 text-sm leading-6 text-stone-600">
                {report.partial}
              </p>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="teach-back-heading">
          <p className="text-xs font-semibold tracking-[0.12em] text-teal-800 uppercase">
            Teach-back
          </p>
          <h2
            className="mt-2 text-3xl font-semibold tracking-[-0.035em]"
            id="teach-back-heading"
          >
            Here’s what Tiro learned
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
            Read this back before the Work Map is confirmed. Correct anything that is missing or too broad.
          </p>

          <ol className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
            {report.teachBack.map((item, index) => (
              <li className="grid gap-3 py-5 sm:grid-cols-[2rem_minmax(0,1fr)]" key={item.step.id}>
                <span className="grid size-8 place-items-center rounded-full bg-stone-100 text-sm font-bold text-stone-700">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-stone-950">{item.step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-stone-600">{item.step.decision}</p>
                  <ul className="mt-3 space-y-2">
                    {item.rules.map((rule) => (
                      <li className="flex gap-2 text-sm leading-6 text-stone-800" key={rule.id}>
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-600" />
                        <span>{rule.statement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              onClick={onConfirm}
              type="button"
            >
              Confirm Work Map
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              onClick={onCorrect}
              type="button"
            >
              Correct something
            </button>
            {notice ? (
              <p className="text-sm font-medium text-stone-600" role="status">
                {notice}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <aside className="min-w-0 space-y-6 xl:sticky xl:top-8 xl:self-start">
        <Panel title="Open items" detail={`${openQuestions.length} left`}>
          <div
            aria-label={`${answered} of ${total} debrief items resolved`}
            aria-valuemax={total}
            aria-valuemin={0}
            aria-valuenow={answered}
            className="mb-5"
            role="progressbar"
          >
            <div className="flex justify-between text-xs font-medium text-stone-500">
              <span>{answered} resolved</span>
              <span>{total} total</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-teal-700"
                style={{ width: `${total ? (answered / total) * 100 : 100}%` }}
              />
            </div>
          </div>
          <ol className="space-y-3">
            {openQuestions.map((question, index) => (
              <QuestionItem
                index={index}
                key={question.id}
                onSelect={onSelectQuestion}
                question={question}
                selected={selectedQuestionId === question.id}
              />
            ))}
          </ol>
        </Panel>

        <Panel title="Event feed" detail={`${report.events.length}`}>
          <ol className="space-y-4">
            {report.events.map((event) => (
              <li className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 text-sm" key={event.id}>
                <time className="font-mono text-xs text-stone-500">{clock(event.t_ms)}</time>
                <div>
                  <p className="leading-6 text-stone-800">{describeEvent(event)}</p>
                  <p className="mt-1 text-xs font-medium text-teal-800">
                    {event.verified ? "Verified screen reading" : "Needs verification"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Evidence" detail={`${report.frames.length} moments`}>
          <p className="text-sm leading-6 text-stone-600">
            Every teach-back step is linked to a verified screen moment and the expert’s own words.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function QuestionItem({
  index,
  onSelect,
  question,
  selected,
}: {
  index: number;
  onSelect: (questionId: string) => void;
  question: Question;
  selected: boolean;
}) {
  return (
    <li>
      <button
        aria-pressed={selected}
        className={`w-full rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-700 ${
          selected
            ? "border-teal-700 bg-teal-50"
            : "border-stone-200 bg-white hover:border-stone-300"
        }`}
        onClick={() => onSelect(question.id)}
        type="button"
      >
        <span className="text-xs font-semibold text-stone-500">Question {index + 1}</span>
        <span className="mt-1 block text-sm leading-6 text-stone-900">{question.text}</span>
        <span className="mt-2 block text-xs font-medium text-stone-500">
          {question.kind.replaceAll("_", " ")} · {question.status}
        </span>
      </button>
    </li>
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
