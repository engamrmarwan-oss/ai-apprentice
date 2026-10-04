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
import { startProblem } from "../capture/capture-data";
import {
  ENGLISH,
  parseLanguages,
  parseTutorRouteError,
  parseTutorSessionStart,
  type TutorLanguage,
} from "./tutor-data";

const ENGLISH_ONLY: TutorLanguage[] = [{ code: ENGLISH, name: "English", ownName: "English" }];

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
  const [languages, setLanguages] = useState<TutorLanguage[] | null>(null);
  const [languagesFailed, setLanguagesFailed] = useState(false);
  const [language, setLanguage] = useState(ENGLISH);
  const [languageError, setLanguageError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/languages", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = response.ok ? parseLanguages(payload) : null;
        setLanguages(parsed?.length ? parsed : ENGLISH_ONLY);
        setLanguagesFailed(!parsed?.length);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLanguages(ENGLISH_ONLY);
        setLanguagesFailed(true);
      });
    return () => controller.abort();
  }, []);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(
    () => () => {
      companionRef.current?.close();
      void engineRef.current?.release();
    },
    [],
  );

  async function startSession() {
    setActionError(null);
    setLanguageError(null);
    setLimitReached(false);
    setIsStarting(true);
    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/tutor-sessions`,
        {
          body: JSON.stringify({ language }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const error = parseTutorRouteError(payload);
      if (response.status === 401 && error?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        if (error?.code === "invalid_input" && error.languageField) {
          setLanguageError(error.languageField);
          return;
        }
        const problem = startProblem(
          response.status,
          error,
          error?.code === "no_map"
            ? "The expert must confirm a Work Map before tutoring can start."
            : "Tiro couldn’t start a tutor session.",
        );
        setLimitReached(problem.limit);
        setActionError(problem.message);
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
            <div className="mt-6">
              <label className="block text-sm font-semibold text-stone-800" htmlFor="tutor-language">
                Language of the lesson
              </label>
              <select
                aria-describedby={`tutor-language-help${languageError ? " tutor-language-error" : ""}`}
                aria-invalid={Boolean(languageError)}
                className={`mt-2 h-11 w-full rounded-lg border bg-white px-3 text-base outline-none focus:ring-2 disabled:bg-stone-50 disabled:text-stone-500 sm:max-w-xs sm:text-sm ${
                  languageError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-stone-300 focus:border-teal-700 focus:ring-teal-100"
                }`}
                disabled={!languages || isStarting}
                id="tutor-language"
                onChange={(event) => {
                  setLanguage(event.target.value);
                  setLanguageError(null);
                }}
                value={language}
              >
                {(languages ?? ENGLISH_ONLY).map((option) => (
                  <option key={option.code} lang={option.code} value={option.code}>
                    {option.ownName}
                  </option>
                ))}
              </select>
              {languageError ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" id="tutor-language-error">
                  {languageError}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-stone-600" id="tutor-language-help">
                Tiro will speak and listen in this language; the screens and the Work Map stay as the expert wrote them.
                {languagesFailed ? " Other languages couldn’t be loaded, so this lesson will be in English." : null}
              </p>
            </div>
            <button className="mt-6 h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" disabled={isStarting} onClick={() => void startSession()} type="button">
              {isStarting ? "Starting session…" : "Start a tutor session"}
            </button>
            {actionError ? (
              <p
                className={`mt-4 text-sm leading-6 ${limitReached ? "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950" : "text-red-700"}`}
                role="alert"
              >
                {actionError}
              </p>
            ) : null}
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

      {view && actionError ? (
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
