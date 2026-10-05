"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTutorEngine,
  type TutorEngine,
  type TutorView,
} from "@/capture/tutor";
import Link from "next/link";
import type { WorkMap } from "@/capture/debrief";
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
      {({ workflow }) => <TutorScreen task={workflow?.task ?? null} tool={workflow?.tool.name ?? null} workflowId={workflowId} />}
    </AuthenticatedApp>
  );
}

type Lesson = { state: "loading" } | { state: "none" } | { state: "ready"; map: WorkMap };

function TutorScreen({ task, tool, workflowId }: { task: string | null; tool: string | null; workflowId: string }) {
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
  const [lesson, setLesson] = useState<Lesson>({ state: "loading" });

  // What a lesson will teach: the newest Work Map the expert has confirmed.
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/workflows/${encodeURIComponent(workflowId)}/work-map?confirmed=1`, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { work_map?: WorkMap | null } | null;
        const map = response.ok ? (payload?.work_map ?? null) : null;
        setLesson(map && Array.isArray(map.steps) && Array.isArray(map.rules) ? { state: "ready", map } : { state: "none" });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLesson({ state: "none" });
      });
    return () => controller.abort();
  }, [workflowId]);

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
    <div className="tiro-enter mx-auto w-full max-w-[88rem] px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">Tutor</h1>
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
        <section className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <LessonBrief lesson={lesson} task={task} tool={tool} workflowId={workflowId} />
          <div className="max-w-2xl border-y border-stone-200 py-8 lg:self-start">
            <h2 className="tiro-display text-3xl font-medium tracking-[-0.02em]">Start a tutor session</h2>
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
            <button className="mt-6 h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-teal-100 disabled:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" disabled={isStarting || lesson.state !== "ready"} onClick={() => void startSession()} type="button">
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

/** What the lesson is about, shown before it starts: the task, where to do it, and what the expert taught Tiro. */
function LessonBrief({ lesson, task, tool, workflowId }: { lesson: Lesson; task: string | null; tool: string | null; workflowId: string }) {
  const where = tool ?? "the tool";
  return (
    <div className="min-w-0">
      <h2 className="tiro-display text-3xl font-medium tracking-[-0.02em]">What you will practise</h2>
      <p className="mt-3 text-base leading-7 text-stone-800">
        {task ?? "The task of this workflow"}
        {tool ? <span className="text-stone-500"> · in {tool}</span> : null}
      </p>

      <h3 className="mt-8 text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">Before you start</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-700">
        <li>Open {where} in another tab of this browser and sign in.</li>
        <li>Go to a case you have not been shown: an item you would normally have to decide on yourself.</li>
        <li>Come back here, start the session, connect voice, and share that tab. Then open the item and work on it as you would.</li>
      </ol>
      <p className="mt-3 text-sm leading-6 text-stone-600">
        Tiro asks what you would decide before you act, and steps in when it goes against how the expert works.
      </p>

      <h3 className="mt-8 text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">What the expert taught Tiro</h3>
      {lesson.state === "loading" ? <p className="mt-3 text-sm text-stone-500">Loading the Work Map…</p> : null}
      {lesson.state === "none" ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          There is nothing to teach yet: the expert has not confirmed a Work Map for this workflow. A lesson can start once a debrief has been confirmed.
        </p>
      ) : null}
      {lesson.state === "ready" ? (
        <div className="mt-3">
          <ol className="space-y-3">
            {lesson.map.steps.map((step) => (
              <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 text-sm" key={step.id}>
                <span className="grid size-7 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">{step.position}</span>
                <div>
                  <p className="font-semibold text-stone-900">{step.title}</p>
                  {step.moment?.screen?.name ? <p className="text-xs text-stone-500">On the screen “{step.moment.screen.name}”</p> : null}
                  <p className="mt-1 leading-6 text-stone-600">{step.decision ?? ""}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm font-semibold text-stone-900">
            {lesson.map.rules.length} rule{lesson.map.rules.length === 1 ? "" : "s"} to keep to
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-stone-700">
            {lesson.map.rules.map((rule) => (
              <li key={rule.id}>{rule.statement}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link className="font-semibold text-teal-800 underline-offset-2 hover:underline" href={`/workflows/${encodeURIComponent(workflowId)}/work-map`}>
              Open the whole Work Map, version {lesson.map.version}
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
