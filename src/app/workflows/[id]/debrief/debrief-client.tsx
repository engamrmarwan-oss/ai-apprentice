"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDebriefEngine,
  EMPTY_DEBRIEF,
  type DebriefEngine,
  type DebriefView as EngineDebriefView,
} from "@/capture/debrief";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { DebriefView } from "@/components/debrief/debrief-view";

type Session = {
  id: string;
  phase: string;
  started_at: string | null;
  /** The newest Work Map built from the session, if any. */
  workMap: { status: string; version: number } | null;
};
type SessionState =
  | { state: "loading" }
  | { state: "ready"; sessions: Session[] }
  | { state: "error"; message: string };

export function DebriefClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <DebriefScreen workflowId={workflowId} />
        ) : (
          <CenteredState
            message="Only the expert teaching this workflow can review its debrief."
            title="Expert access only"
          />
        )
      }
    </AuthenticatedApp>
  );
}

function DebriefScreen({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const engineRef = useRef<DebriefEngine | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({ state: "loading" });
  const [view, setView] = useState<EngineDebriefView>(EMPTY_DEBRIEF);
  const [started, setStarted] = useState(false);
  const [chosen, setChosen] = useState<Session | null>(null);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [listProblem, setListProblem] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/workflows/${encodeURIComponent(workflowId)}/sessions`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401 && routeErrorCode(payload) === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) {
          setSessionState({
            state: "error",
            message: routeErrorMessage(payload) ?? "Tiro couldn’t find a session to debrief.",
          });
          return;
        }
        setSessionState({ state: "ready", sessions: readSessions(payload) });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setSessionState({
          state: "error",
          message: "Tiro couldn’t connect. Check your connection and try again.",
        });
      });
    return () => controller.abort();
  }, [requestKey, router, workflowId]);

  useEffect(
    () => () => {
      void engineRef.current?.release();
    },
    [],
  );

  if (sessionState.state === "loading") return <CenteredState title="Finding your debrief…" />;
  if (sessionState.state === "error") {
    return (
      <CenteredState
        action="Try again"
        message={sessionState.message}
        onAction={() => {
          setSessionState({ state: "loading" });
          setRequestKey((key) => key + 1);
        }}
        title="The debrief didn’t load"
      />
    );
  }
  const sessions = sessionState.sessions;
  const waiting = sessions.filter((one) => one.phase === "debrief");

  async function startDebrief(session: Session) {
    if (engineRef.current) return;
    setChosen(session);
    const engine = createDebriefEngine(session.id, setView);
    engineRef.current = engine;
    setView(engine.view());
    setStarted(true);
    await engine.start();
  }

  async function discard(session: Session) {
    if (!window.confirm("Set this session aside without a Work Map? What it recorded is kept, but it will not be debriefed.")) return;
    setListProblem(null);
    setDiscarding(session.id);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}/discard`, { credentials: "same-origin", method: "POST" });
      if (!response.ok) setListProblem("Tiro couldn’t set that session aside. Try again.");
    } catch {
      setListProblem("Tiro couldn’t connect. Check your connection and try again.");
    } finally {
      setDiscarding(null);
      setRequestKey((key) => key + 1);
    }
  }

  if (!started || !chosen) {
    if (sessions.length === 0) {
      return (
        <CenteredState
          action="Open capture"
          href={`/workflows/${encodeURIComponent(workflowId)}/capture`}
          message="Capture a session and end it first. Its debrief, where Tiro asks about what it saw, opens here."
          title="No session is waiting"
        />
      );
    }
    const done = sessions.filter((one) => one.phase === "ended");
    return (
      <div className="tiro-enter mx-auto w-full max-w-4xl px-5 py-8 sm:px-8 md:px-10 md:py-10">
        <header className="border-b border-stone-200 pb-8">
          <h1 className="text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">Debrief</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Each captured session is debriefed once: Tiro asks what is still open, builds the Work Map, and you confirm it. The newest confirmed Work Map is what new hires are taught.
          </p>
        </header>

        {listProblem ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="alert">{listProblem}</p>
        ) : null}

        <section className="py-8" aria-labelledby="waiting-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="waiting-heading">Waiting for a debrief</h2>
          {waiting.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Nothing is waiting. <Link className="font-semibold text-teal-800 underline-offset-2 hover:underline" href={`/workflows/${encodeURIComponent(workflowId)}/capture`}>Capture a new session</Link> to teach Tiro more.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {waiting.map((session, index) => (
                <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center" key={session.id}>
                  <div className="mr-auto">
                    <p className="font-semibold text-stone-900">Session of {when(session.started_at)}</p>
                    <p className="mt-1 text-sm text-stone-600">
                      {index === 0 ? "Your newest session. " : ""}
                      {session.workMap ? "A draft Work Map exists; it is not confirmed yet." : "Not debriefed yet."}
                    </p>
                  </div>
                  <button className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-700" disabled={discarding !== null} onClick={() => void discard(session)} type="button">
                    {discarding === session.id ? "Setting aside…" : "Set aside"}
                  </button>
                  <button className="h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" disabled={discarding !== null} onClick={() => void startDebrief(session)} type="button">
                    Start debrief
                  </button>
                </li>
              ))}
            </ul>
          )}
          {waiting.length > 0 ? (
            <p className="mt-3 text-xs leading-5 text-stone-500">Starting a debrief connects voice. Your browser will ask for microphone access.</p>
          ) : null}
        </section>

        <section className="border-t border-stone-200 py-8" aria-labelledby="done-heading">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="done-heading">Closed</h2>
          {done.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-stone-600">No session is closed yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {done.map((session) => (
                <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center" key={session.id}>
                  <p className="mr-auto font-medium text-stone-900">Session of {when(session.started_at)}</p>
                  {session.workMap?.status === "confirmed" ? (
                    <Link className="text-sm font-semibold text-teal-800 underline-offset-2 hover:underline" href={`/workflows/${encodeURIComponent(workflowId)}/work-map`}>
                      Work Map version {session.workMap.version} confirmed
                    </Link>
                  ) : (
                    <span className="text-sm text-stone-500">Set aside, no Work Map</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const session = chosen;

  return (
    <div className="tiro-enter mx-auto w-full max-w-[88rem] px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">Debrief</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Fill the gaps Tiro could not ask about while you worked, then check the workflow it learned.
          </p>
        </div>
        <p className="text-sm font-medium text-stone-500">
          Session of {when(session.started_at)} ·{" "}
          <a className="font-semibold text-teal-800 underline-offset-2 hover:underline" href={`/workflows/${encodeURIComponent(workflowId)}/debrief`}>All sessions</a>
        </p>
      </header>

      <div className="py-8">
        <DebriefView
          onBuild={() => engineRef.current?.build() ?? Promise.resolve()}
          onConfirm={() => engineRef.current?.confirm() ?? Promise.resolve()}
          onDismiss={(questionId) => engineRef.current?.dismiss(questionId)}
          onEditRule={(number, statement) =>
            engineRef.current?.editRule(number, statement) ?? Promise.resolve()
          }
          onEditStep={(position, change) =>
            engineRef.current?.editStep(position, change) ?? Promise.resolve()
          }
          onMute={() => engineRef.current?.setMuted(!view.muted)}
          view={view}
        />
      </div>
    </div>
  );
}

function CenteredState({
  action,
  href,
  message,
  onAction,
  title,
}: {
  action?: string;
  href?: string;
  message?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 py-12 text-center">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">{title}</h1>
        {message ? <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p> : null}
        {action && href ? (
          <Link className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" href={href}>
            {action}
          </Link>
        ) : null}
        {action && onAction ? (
          <button className="mt-6 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" onClick={onAction} type="button">
            {action}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function readSessions(value: unknown): Session[] {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return [];
  return value.sessions.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.phase !== "string") return [];
    const map = isRecord(candidate.work_map) ? candidate.work_map : null;
    return [
      {
        id: candidate.id,
        phase: candidate.phase,
        started_at: typeof candidate.started_at === "string" ? candidate.started_at : null,
        workMap: map && typeof map.status === "string" && typeof map.version === "number" ? { status: map.status, version: map.version } : null,
      },
    ];
  });
}

function when(startedAt: string | null) {
  if (!startedAt) return "an unstarted capture";
  return new Date(startedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function routeErrorCode(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  return error && typeof error.code === "string" ? error.code : null;
}

function routeErrorMessage(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  return error && typeof error.message === "string" ? error.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
