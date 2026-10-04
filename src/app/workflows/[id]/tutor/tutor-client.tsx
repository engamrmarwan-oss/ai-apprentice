"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTutorEngine,
  type TutorEngine,
  type TutorView,
} from "@/capture/tutor";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import {
  openTutorCompanion,
  type TutorCompanion,
} from "@/components/tutor/companion";
import { TutorSessionView } from "@/components/tutor/tutor-session-view";
import { parseTutorRouteError, parseTutorSessionStart } from "./tutor-data";

export function TutorClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {() => <TutorScreen workflowId={workflowId} />}
    </AuthenticatedApp>
  );
}

function TutorScreen({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const engineRef = useRef<TutorEngine | null>(null);
  const companionRef = useRef<TutorCompanion | null>(null);
  const [view, setView] = useState<TutorView | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
        `/api/workflows/${encodeURIComponent(workflowId)}/tutor-sessions`,
        { credentials: "same-origin", method: "POST" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const error = parseTutorRouteError(payload);
      if (response.status === 401 && error?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setActionError(
          error?.message ??
            (error?.code === "no_map"
              ? "The expert must confirm a Work Map before tutoring can start."
              : "Tiro couldn’t start a tutor session."),
        );
        return;
      }

      const started = parseTutorSessionStart(payload);
      if (!started) {
        setActionError("Tiro returned an unexpected tutor-session response.");
        return;
      }

      const engine = createTutorEngine(started.sessionId, started.workMap, (next) => {
        setView(next);
        companionRef.current?.show(next);
      });
      engineRef.current = engine;
      setView(engine.view());
    } catch {
      setActionError("Tiro couldn’t connect. Check your connection and try again.");
    } finally {
      setIsStarting(false);
    }
  }

  async function prepareAndOpenCompanion() {
    const engine = engineRef.current;
    if (!engine) return;
    setActionError(null);
    const preparation = engine.prepare();
    try {
      const companion = await openTutorCompanion(engine, () => {
        companionRef.current = null;
        setCompanionOpen(false);
      });
      companionRef.current = companion;
      companion.show(engine.view());
      setCompanionOpen(true);
      await preparation;
    } catch (cause) {
      await preparation;
      setActionError(
        cause instanceof Error ? cause.message : "The companion window did not open.",
      );
    }
  }

  async function openCompanionAgain() {
    const engine = engineRef.current;
    if (!engine) return;
    setActionError(null);
    try {
      const companion = await openTutorCompanion(engine, () => {
        companionRef.current = null;
        setCompanionOpen(false);
      });
      companionRef.current = companion;
      companion.show(engine.view());
      setCompanionOpen(true);
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : "The companion window did not open.",
      );
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

  async function endSession() {
    setActionError(null);
    try {
      await engineRef.current?.end();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Tiro couldn’t end the session.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Tutor</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Share a practice case. Tiro will ask what you would do, check your answer against the expert’s rules, and intervene before a mistake when it can.
          </p>
        </div>
        {view ? (
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <span className={`size-2 rounded-full ${view.phase === "teaching" ? "animate-pulse bg-teal-600" : "bg-stone-400"}`} />
            {phaseLabel(view.phase)}
          </div>
        ) : null}
      </header>

      {!view ? (
        <section className="py-10">
          <div className="max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Start a tutor session</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Tiro will use this workflow’s newest confirmed Work Map. You will connect voice and open the companion before sharing the tool tab.
            </p>
            <button className="mt-6 h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" disabled={isStarting} onClick={() => void startSession()} type="button">
              {isStarting ? "Starting session…" : "Start a tutor session"}
            </button>
          </div>
        </section>
      ) : (
        <TutorSessionView
          companionOpen={companionOpen}
          onCall={() => engineRef.current?.callTiro()}
          onEnd={endSession}
          onMute={() => engineRef.current?.setMuted(!view.muted)}
          onOpenCompanion={openCompanionAgain}
          onPrepare={prepareAndOpenCompanion}
          onShare={shareTool}
          view={view}
        />
      )}

      {actionError ? (
        <p className="mt-5 max-w-2xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

function phaseLabel(phase: TutorView["phase"]) {
  return {
    ended: "Session complete",
    ending: "Ending session",
    idle: "Session ready",
    preparing: "Connecting voice",
    ready: "Ready to share",
    teaching: "Teaching",
  }[phase];
}
