"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createCaptureEngine,
  EMPTY_VIEW,
  type CaptureEngine,
  type CaptureView,
} from "@/capture/engine";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import {
  clock,
  floorLine,
  openCaptureCompanion,
  type CaptureCompanion,
} from "@/components/capture/companion";
import { Icon } from "@/components/ui/icon";
import { describeEvent } from "@/conductor/describe";
import { parseRouteError, parseSessionId } from "./capture-data";

export function CaptureClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <CaptureScreen workflowId={workflowId} />
        ) : (
          <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Expert access only</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Only the expert teaching this workflow can start a capture session.
              </p>
            </div>
          </div>
        )
      }
    </AuthenticatedApp>
  );
}

function CaptureScreen({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<CaptureView>(EMPTY_VIEW);
  const [isStarting, setIsStarting] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const engineRef = useRef<CaptureEngine | null>(null);
  const companionRef = useRef<CaptureCompanion | null>(null);

  useEffect(
    () => () => {
      companionRef.current?.close();
      void engineRef.current?.release();
    },
    [],
  );

  async function startSession() {
    setActionError(null);
    setIsStarting(true);
    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/sessions`,
        {
          body: JSON.stringify({}),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 && parseRouteError(payload)?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setActionError(
          parseRouteError(payload)?.message ?? "Tiro couldn’t start a session. Try again.",
        );
        return;
      }

      const id = parseSessionId(payload);
      if (!id) {
        setActionError("Tiro returned an unexpected session response.");
        return;
      }

      const engine = createCaptureEngine(id, (next) => {
        setView(next);
        companionRef.current?.show(next);
      });
      engineRef.current = engine;
      setSessionId(id);
      setView(engine.view());
    } catch {
      setActionError("Tiro couldn’t connect. Check your connection and try again.");
    } finally {
      setIsStarting(false);
    }
  }

  async function connectVoiceAndOpenCompanion() {
    const engine = engineRef.current;
    if (!engine) return;
    setActionError(null);

    const preparation = engine.prepare();
    try {
      const companion = await openCaptureCompanion(engine, () => {
        companionRef.current = null;
        setCompanionOpen(false);
      });
      companionRef.current = companion;
      companion.show(engine.view());
      setCompanionOpen(true);
      await preparation;
    } catch (cause) {
      await preparation;
      setActionError(cause instanceof Error ? cause.message : "The companion window did not open.");
    }
  }

  async function retryCompanion() {
    const engine = engineRef.current;
    if (!engine) return;
    setActionError(null);
    try {
      const companion = await openCaptureCompanion(engine, () => {
        companionRef.current = null;
        setCompanionOpen(false);
      });
      companionRef.current = companion;
      companion.show(engine.view());
      setCompanionOpen(true);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The companion window did not open.");
    }
  }

  async function shareTool() {
    setActionError(null);
    try {
      await engineRef.current?.share();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The tool tab was not shared.");
    }
  }

  async function endTask() {
    setActionError(null);
    try {
      await engineRef.current?.endTask();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Tiro couldn’t end the task.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-800">Expert session</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Capture the work</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Work through a real example and think aloud. Tiro will watch, listen, and ask about the decisions it notices.
          </p>
        </div>
        {sessionId ? (
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span className={`size-2 rounded-full ${view.phase === "capturing" ? "animate-pulse bg-red-500" : "bg-stone-400"}`} />
            {phaseLabel(view.phase)}
          </div>
        ) : null}
      </header>

      {!sessionId ? (
        <section className="py-10">
          <div className="max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
            <span className="grid size-11 place-items-center rounded-xl bg-teal-50 text-teal-900">
              <Icon className="size-5" name="record" />
            </span>
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Start a session</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              This creates a session in setup. You’ll connect voice and open the companion before choosing the tool tab to share.
            </p>
            <button
              className="mt-6 h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              disabled={isStarting}
              onClick={() => void startSession()}
              type="button"
            >
              {isStarting ? "Starting session…" : "Start a session"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <SetupPanel
            companionOpen={companionOpen}
            onConnect={connectVoiceAndOpenCompanion}
            onOpenCompanion={retryCompanion}
            onShare={shareTool}
            view={view}
          />

          {actionError || view.problem ? (
            <div className="my-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">
              {actionError ?? view.problem}
            </div>
          ) : null}

          <CaptureControls
            onCall={() => engineRef.current?.callTiro()}
            onEnd={endTask}
            onMute={() => engineRef.current?.setMuted(!view.muted)}
            view={view}
          />
          <CaptureDashboard view={view} />

          {view.phase === "ended" ? (
            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-teal-950">Capture complete</h2>
                <p className="mt-1 text-sm text-teal-800">Continue to debrief the open questions with Tiro.</p>
              </div>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
                href={`/workflows/${encodeURIComponent(workflowId)}/debrief`}
              >
                Open debrief
              </Link>
            </div>
          ) : null}
        </>
      )}

      {!sessionId && actionError ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

function SetupPanel({
  companionOpen,
  onConnect,
  onOpenCompanion,
  onShare,
  view,
}: {
  companionOpen: boolean;
  onConnect: () => Promise<void>;
  onOpenCompanion: () => Promise<void>;
  onShare: () => Promise<void>;
  view: CaptureView;
}) {
  if (view.phase === "capturing" || view.phase === "ending" || view.phase === "ended") {
    return null;
  }

  return (
    <section className="mt-8 rounded-2xl border-2 border-teal-800 bg-white p-5 sm:p-7" aria-labelledby="setup-heading">
      <p className="text-xs font-semibold tracking-[0.14em] text-teal-800 uppercase">Do these in order</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]" id="setup-heading">Set up Tiro before sharing</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
        Chrome moves to the shared tab as soon as you choose it. Connect voice and open the companion first, while Tiro’s tab is still in front.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase">Step 1</p>
          <h3 className="mt-1 font-semibold">Connect voice</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">Allows microphone access and opens the always-on-top companion window.</p>
          <button
            className="mt-4 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-stone-300 disabled:text-stone-600 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            disabled={view.phase !== "idle"}
            onClick={() => void onConnect()}
            type="button"
          >
            {view.phase === "preparing" ? "Connecting voice…" : "Connect voice"}
          </button>
          {view.phase === "ready" && !companionOpen ? (
            <button
              className="mt-3 block rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700"
              onClick={() => void onOpenCompanion()}
              type="button"
            >
              Open companion window
            </button>
          ) : null}
          {companionOpen ? <p className="mt-3 text-xs font-medium text-teal-700">Companion open</p> : null}
        </div>
        <div className="rounded-xl border border-stone-200 p-4">
          <p className="text-xs font-semibold text-stone-500 uppercase">Step 2</p>
          <h3 className="mt-1 font-semibold">Share the tool’s tab</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">Choose only the tab where you do the task. Capture begins immediately.</p>
          <button
            className="mt-4 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
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

function CaptureControls({
  onCall,
  onEnd,
  onMute,
  view,
}: {
  onCall: () => void;
  onEnd: () => Promise<void>;
  onMute: () => void;
  view: CaptureView;
}) {
  const active = view.phase === "capturing";
  return (
    <section className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4" aria-label="Capture controls">
      <div className="mr-auto min-w-48">
        <p className="text-xs font-semibold tracking-[0.1em] text-stone-500 uppercase">Floor</p>
        <p className="mt-1 font-semibold text-stone-900">{floorLine(view)}</p>
      </div>
      <button
        className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700"
        disabled={!active || view.voice !== "on" || view.muted}
        onClick={onCall}
        type="button"
      >
        Call Tiro
      </button>
      <button
        className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-teal-700"
        disabled={!active}
        onClick={onMute}
        type="button"
      >
        {view.muted ? "Unmute" : "Mute"}
      </button>
      <button
        className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white outline-none hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
        disabled={!active}
        onClick={() => void onEnd()}
        type="button"
      >
        {view.phase === "ending" ? "Ending…" : "End task"}
      </button>
    </section>
  );
}

function CaptureDashboard({ view }: { view: CaptureView }) {
  return (
    <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-6">
        <Panel title="Tool preview" detail={`${view.frames} frame${view.frames === 1 ? "" : "s"}${view.reading ? " · Reading" : ""}`}>
          <FramePreview frame={view.lastFrame} />
        </Panel>
        <Panel title="What Tiro will say next">
          {view.planned ? (
            <div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-950">
              <p>{view.planned.summary}</p>
              {view.planned.question ? <p className="mt-2 font-semibold">{view.planned.question}</p> : null}
            </div>
          ) : (
            <EmptyLine text="Nothing planned yet. Tiro waits for a useful pause." />
          )}
        </Panel>
        <Panel title="Question queue" detail={`${view.questions.length}`}>
          {view.questions.length ? (
            <ol className="space-y-3">
              {view.questions.map((question) => (
                <li className="rounded-xl border border-stone-200 p-3" key={question.id}>
                  <p className="text-sm leading-6 text-stone-900">{question.text}</p>
                  <p className="mt-2 text-xs font-medium text-stone-500">
                    {question.kind.replaceAll("_", " ")} · {question.status} · {question.channel}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyLine text="Questions will appear as Tiro notices decisions and gaps." />
          )}
        </Panel>
      </div>

      <div className="min-w-0 space-y-6">
        <Panel title="Live transcript" detail={view.partial ? "Listening" : `${view.spoken.length} lines`}>
          <div className="max-h-80 overflow-y-auto pr-1">
            {view.spoken.length ? (
              <ol className="space-y-3">
                {view.spoken.map((line) => (
                  <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 text-sm" key={line.key}>
                    <span className="font-mono text-xs text-stone-500">{clock(line.start_ms)}</span>
                    <p className="leading-6">
                      <strong>{line.speaker === "agent" ? "Tiro" : "Expert"}:</strong> {line.text}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyLine text="Speech will appear here once capture begins." />
            )}
            {view.partial ? (
              <p className="mt-3 border-l-2 border-teal-400 pl-3 text-sm leading-6 text-stone-500" aria-live="polite">
                Hearing: {view.partial}
              </p>
            ) : null}
          </div>
        </Panel>
        <Panel title="Event feed" detail={`${view.events.length}`}>
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
            <EmptyLine text="Screen events will appear after the shared tab settles." />
          )}
        </Panel>
      </div>
    </div>
  );
}

function FramePreview({ frame }: { frame: Blob | null }) {
  const url = useMemo(() => (frame ? URL.createObjectURL(frame) : null), [frame]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  return url ? (
    // The source is a local object URL created from the engine's latest scaled frame.
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

function phaseLabel(phase: CaptureView["phase"]) {
  return {
    idle: "Session ready",
    preparing: "Connecting voice",
    ready: "Ready to share",
    capturing: "Capturing",
    ending: "Ending task",
    ended: "Capture complete",
  }[phase];
}
