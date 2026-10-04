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

type Session = { id: string; phase: string; started_at?: string | null };
type SessionState =
  | { state: "loading" }
  | { state: "ready"; session: Session | null }
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
        setSessionState({ state: "ready", session: newestDebriefSession(payload) });
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
  if (!sessionState.session) {
    return (
      <CenteredState
        action="Open capture"
        href={`/workflows/${encodeURIComponent(workflowId)}/capture`}
        message="Capture a session and end it first. Its debrief, where Tiro asks about what it saw, opens here."
        title="No session is waiting"
      />
    );
  }

  const session = sessionState.session;

  async function startDebrief() {
    if (engineRef.current) return;
    const engine = createDebriefEngine(session.id, setView);
    engineRef.current = engine;
    setView(engine.view());
    setStarted(true);
    await engine.start();
  }

  if (!started) {
    return (
      <CenteredState
        action="Start debrief"
        message="Tiro will check the captured decisions, connect voice, ask the open questions, and build the Work Map. Your browser will ask for microphone access."
        onAction={() => void startDebrief()}
        title="Ready to debrief"
      />
    );
  }

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
          Session {shortId(session.id)}
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

function newestDebriefSession(value: unknown): Session | null {
  if (!isRecord(value) || !Array.isArray(value.sessions)) return null;
  for (const candidate of value.sessions) {
    if (
      isRecord(candidate) &&
      typeof candidate.id === "string" &&
      candidate.phase === "debrief"
    ) {
      return {
        id: candidate.id,
        phase: candidate.phase,
        started_at: typeof candidate.started_at === "string" ? candidate.started_at : null,
      };
    }
  }
  return null;
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

function shortId(value: string) {
  return value.slice(0, 8);
}
