"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { MasteryReport } from "@/components/mastery/mastery-report";
import type { MasteryReport as TutorMasteryReport } from "@/components/mastery/types";
import {
  parseMasteryError,
  parseMasteryReport,
  parseTutorSessions,
  sessionLabel,
  type TutorSessionSummary,
} from "./mastery-data";

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

type RequestResult<T> = { status: "signed_out" } | Exclude<Loaded<T>, { status: "loading" }>;

const CONNECTION_ERROR = "Tiro couldn’t connect. Check your connection and try again.";

export function MasteryClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {() => <MasteryView workflowId={workflowId} />}
    </AuthenticatedApp>
  );
}

function MasteryView({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Loaded<TutorSessionSummary[]>>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [report, setReport] = useState<Loaded<TutorMasteryReport>>({ status: "loading" });
  const [reportAttempt, setReportAttempt] = useState(0);

  const loadSessions = useCallback(
    (signal?: AbortSignal) =>
      requestSessions(workflowId, signal).then(
        (result) => {
          if (result.status === "signed_out") {
            router.replace("/sign-in");
            return;
          }
          setSessions(result);
          if (result.status === "ready") setSelectedId(result.data[0]?.id ?? null);
        },
        (error: unknown) => {
          if (isAbort(error)) return;
          setSessions({ status: "error", message: CONNECTION_ERROR });
        },
      ),
    [router, workflowId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void requestReport(selectedId, controller.signal).then(
      (result) => {
        if (result.status === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        setReport(result);
      },
      (error: unknown) => {
        if (isAbort(error)) return;
        setReport({ status: "error", message: CONNECTION_ERROR });
      },
    );
    return () => controller.abort();
  }, [reportAttempt, router, selectedId]);

  if (sessions.status === "ready" && sessions.data.length === 0) {
    return <EmptyState workflowId={workflowId} />;
  }

  const selected =
    sessions.status === "ready"
      ? sessions.data.find((session) => session.id === selectedId)
      : undefined;

  return (
    <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">Mastery report</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            How each of the expert’s rules went in your tutor session, and what to practise next.
          </p>
        </div>
        {sessions.status === "ready" ? (
          <div className="min-w-0 sm:w-64">
            <label className="text-sm font-semibold text-stone-800" htmlFor="mastery-session">
              Tutor session
            </label>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100 sm:text-sm"
              id="mastery-session"
              onChange={(event) => {
                setReport({ status: "loading" });
                setSelectedId(event.target.value);
              }}
              value={selectedId ?? ""}
            >
              {sessions.data.map((session) => (
                <option key={session.id} value={session.id}>
                  {sessionLabel(session)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      <div className="py-8">
        {sessions.status === "loading" || (sessions.status === "ready" && report.status === "loading") ? (
          <p className="text-sm text-stone-600" aria-live="polite">Loading report…</p>
        ) : sessions.status === "error" ? (
          <LoadError
            message={sessions.message}
            onRetry={() => {
              setSessions({ status: "loading" });
              void loadSessions();
            }}
            title="Your tutor sessions didn’t load"
          />
        ) : report.status === "error" ? (
          <LoadError
            message={report.message}
            onRetry={() => {
              setReport({ status: "loading" });
              setReportAttempt((attempt) => attempt + 1);
            }}
            title="This report didn’t load"
          />
        ) : report.status === "ready" ? (
          <>
            {selected && selected.phase !== "ended" ? (
              <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                This session has not ended yet, so the report may still change.
              </p>
            ) : null}
            <MasteryReport report={report.data} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ workflowId }: { workflowId: string }) {
  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-2xl place-items-center px-6 py-12 text-center">
      <div>
        <h1 className="text-4xl font-medium tracking-[-0.025em] text-balance sm:text-[2.75rem]">
          Mastery report
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600">
          Finish a tutor session to see how you did on each of the expert’s rules, and what to practise next.
        </p>
        <Link
          className="mt-7 inline-flex h-11 items-center justify-center rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          href={`/workflows/${encodeURIComponent(workflowId)}/tutor`}
        >
          Start a tutor session
        </Link>
      </div>
    </div>
  );
}

function LoadError({
  message,
  onRetry,
  title,
}: {
  message: string;
  onRetry: () => void;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h2 className="font-semibold text-red-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{message}</p>
      <button
        className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 outline-none hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-700"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

async function requestSessions(
  workflowId: string,
  signal?: AbortSignal,
): Promise<RequestResult<TutorSessionSummary[]>> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/tutor-sessions`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const error = parseMasteryError(payload);
  if (response.status === 401 && error?.code === "signed_out") return { status: "signed_out" };
  if (!response.ok) {
    return { status: "error", message: error?.message ?? "Tiro couldn’t load your tutor sessions." };
  }
  const data = parseTutorSessions(payload);
  return data
    ? { status: "ready", data }
    : { status: "error", message: "Tiro received an unexpected response." };
}

async function requestReport(
  sessionId: string,
  signal?: AbortSignal,
): Promise<RequestResult<TutorMasteryReport>> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/report`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const error = parseMasteryError(payload);
  if (response.status === 401 && error?.code === "signed_out") return { status: "signed_out" };
  if (!response.ok) {
    return { status: "error", message: error?.message ?? "Tiro couldn’t load this report." };
  }
  const data = parseMasteryReport(payload);
  return data
    ? { status: "ready", data }
    : { status: "error", message: "Tiro received an unexpected response." };
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
