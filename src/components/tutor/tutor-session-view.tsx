"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import type { TutorView } from "@/capture/tutor";
import { describeEvent } from "@/conductor/describe";
import { MasteryReport } from "@/components/mastery/mastery-report";
import { tutorFloorLine } from "./companion";

export function TutorSessionView({
  companionOpen,
  onCall,
  onEnd,
  onMute,
  onOpenCompanion,
  onPrepare,
  onShare,
  view,
}: {
  companionOpen: boolean;
  onCall: () => void;
  onEnd: () => Promise<void>;
  onMute: () => void;
  onOpenCompanion: () => Promise<void>;
  onPrepare: () => Promise<void>;
  onShare: () => Promise<void>;
  view: TutorView;
}) {
  return (
    <div className="min-w-0">
      <SetupPanel
        companionOpen={companionOpen}
        onOpenCompanion={onOpenCompanion}
        onPrepare={onPrepare}
        onShare={onShare}
        view={view}
      />

      {view.problem ? (
        <p className="my-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">
          {view.problem}
        </p>
      ) : null}

      <Controls onCall={onCall} onEnd={onEnd} onMute={onMute} view={view} />

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.18fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Learner’s tool" detail={`${view.frames} frame${view.frames === 1 ? "" : "s"}`}>
            <FramePreview frame={view.lastFrame} />
          </Panel>
          <Panel title="Process being taught" detail={`Version ${view.workMap.version}`}>
            <ol className="space-y-3">
              {view.workMap.steps.map((step) => (
                <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 text-sm" key={step.id}>
                  <span className="grid size-7 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">
                    {step.position}
                  </span>
                  <div>
                    <p className="font-semibold text-stone-900">{step.title}</p>
                    <p className="mt-1 leading-6 text-stone-600">{step.decision ?? "No decision recorded."}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Caught" detail={`${view.catches.length}`}>
            {view.catches.length ? (
              <ol className="space-y-3">
                {view.catches.map((caught, index) => (
                  <li className="rounded-xl border border-amber-200 bg-amber-50 p-3" key={`${caught.at}-${caught.rule.id}-${index}`}>
                    <p className="text-xs font-semibold text-amber-800">
                      {clock(caught.at)} · Rule {caught.rule.number} · {caught.before_acting ? "Before acting" : "After acting"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-950">
                      {caught.explanation ?? caught.rule.statement}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">{caught.what}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyLine text="Tiro has not needed to intervene." />
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Conversation" detail={view.partial ? "Listening" : `${view.spoken.length} lines`}>
            {view.spoken.length ? (
              <ol className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {view.spoken.map((line) => (
                  <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 text-sm" key={line.key}>
                    <span className="font-mono text-xs text-stone-500">{clock(line.start_ms)}</span>
                    <p className="leading-6">
                      <strong>{line.speaker === "agent" ? "Tiro" : "Learner"}:</strong> {line.text}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyLine text="The tutor conversation will appear after sharing starts." />
            )}
            {view.partial ? (
              <p className="mt-3 border-l-2 border-teal-400 pl-3 text-sm leading-6 text-stone-500" aria-live="polite">
                Hearing: {view.partial}
              </p>
            ) : null}
          </Panel>
          <Panel title="Screen events" detail={`${view.events.length}`}>
            {view.events.length ? (
              <ol className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {view.events.map((event) => (
                  <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 text-sm" key={event.id}>
                    <span className="font-mono text-xs text-stone-500">{clock(event.t_ms)}</span>
                    <p className="leading-6 text-stone-800">{describeEvent(event)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyLine text="Tiro will list settled changes from the shared tab." />
            )}
          </Panel>
          <Panel title="Expert replay">
            {view.replay ? (
              <div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-950">
                <p className="font-semibold">Rule {view.replay.number}: {view.replay.statement}</p>
                <p className="mt-2">The expert’s screenshot and quote are showing in the companion window.</p>
              </div>
            ) : (
              <EmptyLine text="When Tiro catches a rule, the companion shows the expert’s screenshot and words." />
            )}
          </Panel>
        </div>
      </div>

      {view.report ? (
        <section className="mt-10 border-t border-stone-200 pt-9" aria-labelledby="mastery-heading">
          <div className="mb-8">
            <h2 className="text-3xl font-semibold tracking-[-0.035em]" id="mastery-heading">
              Mastery report
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Your final outcomes come directly from this tutor session.
            </p>
          </div>
          <MasteryReport report={view.report} />
        </section>
      ) : null}
    </div>
  );
}

function SetupPanel({
  companionOpen,
  onOpenCompanion,
  onPrepare,
  onShare,
  view,
}: {
  companionOpen: boolean;
  onOpenCompanion: () => Promise<void>;
  onPrepare: () => Promise<void>;
  onShare: () => Promise<void>;
  view: TutorView;
}) {
  if (view.phase === "teaching" || view.phase === "ending" || view.phase === "ended") return null;

  return (
    <section className="mt-8 rounded-2xl border-2 border-teal-800 bg-white p-5 sm:p-7" aria-labelledby="tutor-setup-heading">
      <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="tutor-setup-heading">
        Set up Tiro before sharing
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        Chrome moves to the shared tab as soon as you choose it. Connect voice and open the companion first, while Tiro’s tab is still in front.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase">Step 1</p>
          <h3 className="mt-1 font-semibold">Connect voice</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Allows microphone access and opens the companion with tutor controls and expert replays.
          </p>
          <button
            className="mt-4 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            disabled={view.phase !== "idle"}
            onClick={() => void onPrepare()}
            type="button"
          >
            {view.phase === "preparing" ? "Connecting voice…" : "Connect voice"}
          </button>
          {view.phase === "ready" && !companionOpen ? (
            <button className="mt-3 block rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700" onClick={() => void onOpenCompanion()} type="button">
              Open companion window
            </button>
          ) : null}
          {companionOpen ? <p className="mt-3 text-xs font-medium text-teal-700">Companion open</p> : null}
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase">Step 2</p>
          <h3 className="mt-1 font-semibold">Share the tool’s tab</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Choose the tab where you will practise. Teaching starts immediately.
          </p>
          <button
            className="mt-4 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-not-allowed disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            disabled={view.phase !== "ready" || !companionOpen}
            onClick={() => void onShare()}
            type="button"
          >
            Share the tool’s tab
          </button>
        </div>
      </div>
    </section>
  );
}

function Controls({
  onCall,
  onEnd,
  onMute,
  view,
}: {
  onCall: () => void;
  onEnd: () => Promise<void>;
  onMute: () => void;
  view: TutorView;
}) {
  const active = view.phase === "teaching";
  return (
    <section className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4" aria-label="Tutor controls">
      <div className="mr-auto min-w-48">
        <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">Floor</p>
        <p className="mt-1 font-semibold text-stone-900">{tutorFloorLine(view)}</p>
        <p className="mt-1 text-xs text-stone-500">
          {clock(view.elapsedMs)} · {view.screen?.item ?? view.screen?.name ?? "Waiting for the tool"}
        </p>
      </div>
      <button className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700" disabled={!active || view.voice !== "on" || view.floor.state === "open" || view.muted} onClick={onCall} type="button">
        Call Tiro
      </button>
      <button className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700" disabled={!active} onClick={onMute} type="button">
        {view.muted ? "Unmute" : "Mute"}
      </button>
      <button className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white outline-none hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-700 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2" disabled={!active} onClick={() => void onEnd()} type="button">
        {view.phase === "ending" ? "Ending…" : "End session"}
      </button>
    </section>
  );
}

function FramePreview({ frame }: { frame: Blob | null }) {
  const url = useMemo(() => (frame ? URL.createObjectURL(frame) : null), [frame]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return url ? (
    // The source is a local object URL created from the tutor engine's latest scaled frame.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="aspect-video w-full rounded-xl bg-stone-100 object-contain" src={url} alt="Latest shared tool frame" />
  ) : (
    <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 text-center text-sm leading-6 text-stone-500">
      The latest frame from the shared tool tab will appear here.
    </div>
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

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm leading-6 text-stone-500">{text}</p>;
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
