"use client";

import { useEffect, useRef, useState } from "react";
import { createCaptureEngine, EMPTY_VIEW, type CaptureEngine, type CaptureView } from "@/capture/engine";
import { describeEvent, isDecision } from "@/conductor/describe";
import { floorLine, openCompanion, type Companion } from "./companion";

type Workflow = { id: string; task: string; tool: { name: string }; role: string };
type Me = { state: "loading" } | { state: "signed_out" } | { state: "signed_in"; name: string; workflows: Workflow[] };

const button = "rounded border px-3 py-2 disabled:opacity-40";
const input = "rounded border px-2 py-1";

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

async function send(path: string, method: string, body?: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const answer = await response.json().catch(() => null);
  if (response.ok && answer?.ok) return answer;
  throw new Error(answer?.error?.message ?? `The server answered ${response.status}.`);
}

async function whoIsSignedIn(): Promise<Me> {
  const response = await fetch("/api/me", { credentials: "same-origin" }).catch(() => null);
  const answer = await response?.json().catch(() => null);
  if (response?.ok && answer?.ok) return { state: "signed_in", name: answer.user.name, workflows: answer.workflows };
  return { state: "signed_out" };
}

/** What the phase asks of a session, counted from what the engine shows. */
function checks(view: CaptureView) {
  const turns = view.floors.filter((floor) => floor.kind === "summary" && floor.agentTurns > 0);
  const asked = view.questions.filter((question) => question.status === "asked" || question.status === "answered");
  return [
    { label: "Events read from the screen", pass: view.events.length > 0, detail: `${view.events.length}, of which ${view.events.filter(isDecision).length} decisions` },
    { label: "A transcript", pass: view.spoken.some((one) => one.speaker === "expert"), detail: `${view.spoken.filter((one) => one.speaker === "expert").length} stretches of the expert's speech` },
    { label: "At least three turns at a pause", pass: turns.length >= 3, detail: `${turns.length}` },
    { label: "Follow-up questions asked", pass: asked.length > 0, detail: `${asked.length}: ${asked.map((question) => question.kind).join(", ") || "none"}` },
  ];
}

export function SessionBench() {
  const [me, setMe] = useState<Me>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<CaptureView>(EMPTY_VIEW);
  const [companionOpen, setCompanionOpen] = useState(false);
  const engine = useRef<CaptureEngine | null>(null);
  const companion = useRef<Companion | null>(null);
  /** Everything the engine did, one line each: for working out afterwards what happened. Kept out of the page. */
  const trace = useRef<string[]>([]);

  const attempt = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    }
  };

  const load = async () => setMe(await whoIsSignedIn());

  useEffect(() => {
    let showing = true;
    void whoIsSignedIn().then((found) => {
      if (showing) setMe(found);
    });
    return () => {
      showing = false;
      companion.current?.close();
      void engine.current?.release();
    };
  }, []);

  const signIn = (form: FormData) =>
    attempt(async () => {
      await send("/api/auth/sign-in", "POST", { email: form.get("email"), password: form.get("password") });
      await load();
    });

  const createWorkflow = (form: FormData) =>
    attempt(async () => {
      await send("/api/workflows", "POST", {
        tool_name: form.get("tool_name"),
        task: form.get("task"),
        role: form.get("role") || undefined,
      });
      await load();
    });

  const newSession = (workflowId: string) =>
    attempt(async () => {
      const answer = await send(`/api/workflows/${workflowId}/sessions`, "POST", {});
      const id: string = answer.session.id;
      trace.current = [];
      engine.current = createCaptureEngine(
        id,
        (next) => {
          setView(next);
          companion.current?.show(next);
        },
        { trace: (t, line) => trace.current.push(`${(t / 1000).toFixed(1)} ${line}`) },
      );
      setSessionId(id);
    });

  const download = () =>
    attempt(async () => {
      const stored = sessionId ? await send(`/api/sessions/${sessionId}`, "GET") : null;
      const shown = { ...view, lastFrame: undefined };
      const result = { sessionId, view: shown, checks: checks(view), trace: trace.current, stored };
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `tiro-session-${sessionId}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

  const expertOn = me.state === "signed_in" ? me.workflows.filter((workflow) => workflow.role === "expert") : [];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Session bench</h1>
        <p className="mt-1 opacity-70">
          Runs one expert session end to end: Tiro watches a tab you share, listens, and speaks at pauses. A bare test
          page, not a product screen. Use Chrome or Edge.
        </p>
      </header>

      {error && <p className="rounded border border-red-500 p-3 text-red-600">{error}</p>}

      {me.state === "loading" && <p className="opacity-70">Checking who is signed in…</p>}

      {me.state === "signed_out" && (
        <form action={signIn} className="grid max-w-sm gap-2 rounded border p-4">
          <h2 className="font-semibold">Sign in</h2>
          <input className={input} name="email" type="email" placeholder="Email" autoComplete="username" required />
          <input className={input} name="password" type="password" placeholder="Password" autoComplete="current-password" required />
          <button className={button}>Sign in</button>
        </form>
      )}

      {me.state === "signed_in" && !sessionId && (
        <section className="grid gap-4">
          <p>
            Signed in as <strong>{me.name}</strong>. Pick the workflow to record.
          </p>
          <ul className="grid gap-2">
            {expertOn.map((workflow) => (
              <li key={workflow.id} className="flex items-center justify-between gap-4 rounded border p-3">
                <span>
                  <strong>{workflow.task}</strong> <span className="opacity-60">in {workflow.tool.name}</span>
                </span>
                <button className={button} onClick={() => newSession(workflow.id)}>
                  Start a session
                </button>
              </li>
            ))}
            {expertOn.length === 0 && <li className="opacity-70">You teach no workflow yet. Add one below.</li>}
          </ul>
          <form action={createWorkflow} className="grid max-w-md gap-2 rounded border p-4">
            <h2 className="font-semibold">Add a workflow</h2>
            <input className={input} name="tool_name" placeholder="The tool, for example its name" required />
            <input className={input} name="task" placeholder="The task, in a few words" required />
            <input className={input} name="role" placeholder="Your job title (optional)" />
            <button className={button}>Add</button>
          </form>
        </section>
      )}

      {sessionId && (
        <>
          <section className="rounded border-2 border-blue-600 p-4" aria-live="polite">
            <p className="text-xs uppercase tracking-wide opacity-60">Do these in order</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={button} disabled={view.phase !== "idle"} onClick={() => attempt(() => engine.current!.prepare())}>
                1. Connect voice
              </button>
              <button
                className={button}
                disabled={view.phase !== "ready" || companionOpen}
                onClick={() =>
                  attempt(async () => {
                    companion.current = await openCompanion(engine.current!, () => {
                      companion.current = null;
                      setCompanionOpen(false);
                    });
                    companion.current.show(view);
                    setCompanionOpen(true);
                  })
                }
              >
                2. Open the small window
              </button>
              <button className={button} disabled={view.phase !== "ready"} onClick={() => attempt(() => engine.current!.share())}>
                3. Share the tool&apos;s tab
              </button>
            </div>
            <p className="mt-3 opacity-70">
              After step 3 Chrome moves you to the tool. Tiro greets you and asks what you are about to do. Then work as you
              normally would, thinking aloud. Say &ldquo;Tiro&rdquo; or press Call Tiro to tell it something. Press End
              task when you are done.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={button} disabled={view.phase !== "capturing"} onClick={() => engine.current!.callTiro()}>
                Call Tiro
              </button>
              <button className={button} disabled={view.phase !== "capturing"} onClick={() => engine.current!.setMuted(!view.muted)}>
                {view.muted ? "Unmute" : "Mute"}
              </button>
              <button className={button} disabled={view.voice !== "lost"} onClick={() => attempt(() => engine.current!.reconnectVoice())}>
                Reconnect voice
              </button>
              <button className={button} disabled={view.phase !== "capturing"} onClick={() => attempt(() => engine.current!.endTask())}>
                End task
              </button>
              <button className={button} disabled={view.phase !== "ended"} onClick={download}>
                Download the result
              </button>
            </div>
          </section>

          {view.problem && <p className="rounded border border-amber-500 p-3">{view.problem}</p>}

          <section>
            <h2 className="mb-2 font-semibold">Now</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {[
                ["Session", view.phase],
                ["Time", clock(view.elapsedMs)],
                ["Voice", view.voice],
                ["Tiro", floorLine(view)],
                ["Waiting for", view.floor.waitingFor ?? "nothing"],
                ["Turns in ten minutes", `${view.floor.turnsInWindow}${view.floor.owed ? " (owes more)" : ""}`],
                ["Frames", `${view.frames}${view.reading ? " (reading)" : ""}`],
                ["Screen", view.screen ? `${view.screen.name}${view.screen.item ? ` · ${view.screen.item}` : ""}` : "not read yet"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="opacity-60">{label}</dt>
                  <dd className="font-mono">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 min-h-5 opacity-70">{view.partial ? `Hearing: ${view.partial}` : ""}</p>
            {view.planned && (
              <p className="mt-1 rounded border p-2">
                <span className="opacity-60">At the next pause Tiro will say: </span>
                {view.planned.summary}
                {view.planned.question && <span className="opacity-60"> Then, if needed: </span>}
                {view.planned.question}
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">What the phase asks for</h2>
            <ul className="space-y-1">
              {checks(view).map((check) => (
                <li key={check.label}>
                  <span className={check.pass ? "text-green-700" : "opacity-60"}>{check.pass ? "yes" : "not yet"}</span> · {check.label}
                  <span className="opacity-60"> · {check.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="mb-2 font-semibold">Read from the screen</h2>
              <ol className="max-h-80 space-y-0.5 overflow-y-auto font-mono text-xs">
                {view.events.map((event) => (
                  <li key={event.id} className={isDecision(event) ? "font-semibold" : ""}>
                    {clock(event.t_ms)} {describeEvent(event)}
                    {event.confidence < 0.7 && <span className="opacity-60"> (unsure)</span>}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2 className="mb-2 font-semibold">Said</h2>
              <ol className="max-h-80 space-y-0.5 overflow-y-auto text-xs">
                {view.spoken.map((one) => (
                  <li key={one.key}>
                    <span className="font-mono opacity-60">{clock(one.start_ms)}</span>{" "}
                    <strong>{one.speaker === "agent" ? "Tiro" : "Expert"}:</strong> {one.text}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section>
            <h2 className="mb-2 font-semibold">Tiro&apos;s turns</h2>
            <ol className="space-y-1 text-xs">
              {view.floors.map((floor) => (
                <li key={floor.openedAt}>
                  <span className="font-mono opacity-60">
                    {clock(floor.openedAt)}–{clock(floor.closedAt)}
                  </span>{" "}
                  {floor.kind} · ended: {floor.reason} · Tiro spoke {floor.agentTurns}×
                  {floor.plan && <span className="opacity-70"> · {floor.plan.summary}</span>}
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Questions</h2>
            <ol className="space-y-1 text-xs">
              {view.questions.map((question) => (
                <li key={question.id}>
                  <span className="font-mono opacity-60">
                    {question.kind} · {question.score.toFixed(2)} · {question.status} · {question.channel}
                  </span>{" "}
                  {question.text}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
