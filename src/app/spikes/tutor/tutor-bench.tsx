"use client";

// A bare page that runs one tutor session end to end, before the product's
// tutor screen exists: pick a workflow with a confirmed Work Map, connect the
// voice, share the tool's tab, work a case, end, and read the mastery report.
import { useEffect, useRef, useState } from "react";
import type { WorkMap } from "@/capture/debrief";
import { createTutorEngine, type TutorEngine, type TutorView } from "@/capture/tutor";
import { describeEvent } from "@/conductor/describe";

type Workflow = { id: string; task: string; role: string; tool: { name: string } };
type Me = { state: "loading" } | { state: "signed_out" } | { state: "signed_in"; name: string; workflows: Workflow[] };

const button = "rounded border px-3 py-2 disabled:opacity-40";
const input = "rounded border px-2 py-1";
const OUTCOME = { passed_first_time: "passed first time", needed_hint: "needed a hint", violated: "violated", not_encountered: "not encountered" } as const;

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

async function load(): Promise<Me> {
  const response = await fetch("/api/me", { credentials: "same-origin" }).catch(() => null);
  const answer = await response?.json().catch(() => null);
  return response?.ok && answer?.ok ? { state: "signed_in", name: answer.user.name, workflows: answer.workflows } : { state: "signed_out" };
}

export function TutorBench() {
  const [me, setMe] = useState<Me>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<TutorView | null>(null);
  const engine = useRef<TutorEngine | null>(null);
  const trace = useRef<string[]>([]);

  useEffect(() => {
    let showing = true;
    void load().then((found) => {
      if (showing) setMe(found);
    });
    return () => {
      showing = false;
      void engine.current?.release();
    };
  }, []);

  const signIn = async (form: FormData) => {
    setError(null);
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (!response.ok) setError("That email and password did not work.");
    setMe(await load());
  };

  const begin = async (workflowId: string) => {
    setError(null);
    const response = await fetch(`/api/workflows/${workflowId}/tutor-sessions`, { method: "POST", credentials: "same-origin" });
    const answer = await response.json().catch(() => null);
    if (!response.ok || !answer?.ok) {
      setError(answer?.error?.message ?? `The server answered ${response.status}.`);
      return;
    }
    trace.current = [];
    engine.current = createTutorEngine(answer.session.id, answer.work_map as WorkMap, setView, {
      trace: (t, line) => trace.current.push(`${(t / 1000).toFixed(1)} ${line}`),
    });
    setView(engine.current.view());
  };

  const download = () => {
    if (!view) return;
    const { lastFrame: _picture, ...shown } = view;
    void _picture;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify({ view: shown, trace: trace.current }, null, 2)], { type: "application/json" }));
    link.download = "tiro-tutor-session.json";
    link.click();
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Tutor bench</h1>
        <p className="text-stone-600">A bare test page. It runs one tutor session on a workflow whose Work Map the expert has confirmed.</p>
      </header>
      {error ? <p className="rounded border border-red-300 bg-red-50 p-2 text-red-800">{error}</p> : null}
      {me.state === "loading" ? <p>Loading…</p> : null}

      {me.state === "signed_out" ? (
        <form action={signIn} className="flex flex-wrap items-end gap-2">
          <input className={input} name="email" placeholder="Email" type="email" required />
          <input className={input} name="password" placeholder="Password" type="password" required />
          <button className={button} type="submit">Sign in</button>
        </form>
      ) : null}

      {me.state === "signed_in" && !view ? (
        <section className="space-y-2">
          <p>Signed in as {me.name}. Pick a workflow to be taught:</p>
          <ul className="space-y-2">
            {me.workflows.map((workflow) => (
              <li className="flex items-center gap-3" key={workflow.id}>
                <button className={button} onClick={() => void begin(workflow.id)} type="button">Start a tutor session</button>
                <span>{workflow.tool.name}: {workflow.task} ({workflow.role})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view ? (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded border p-3">
            <button className={button} disabled={view.phase !== "idle"} onClick={() => void engine.current?.prepare()} type="button">1. Connect voice</button>
            <button className={button} disabled={view.phase !== "ready"} onClick={() => void engine.current?.share()} type="button">2. Share the tool&apos;s tab</button>
            <button className={button} disabled={view.phase !== "teaching" || view.floor.state === "open"} onClick={() => engine.current?.callTiro()} type="button">Call Tiro</button>
            <button className={button} disabled={view.phase !== "teaching"} onClick={() => void engine.current?.end()} type="button">End the session</button>
            <button className={button} disabled={view.phase !== "ended"} onClick={download} type="button">Download the result</button>
          </section>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 md:grid-cols-4">
            <div><dt className="text-stone-500">Session</dt><dd data-testid="phase">{view.phase}</dd></div>
            <div><dt className="text-stone-500">Voice</dt><dd>{view.voice}</dd></div>
            <div><dt className="text-stone-500">Tiro</dt><dd data-testid="floor">{view.floor.state === "open" ? `${view.agentSpeaking ? "speaking" : "listening"} (${view.floor.kind})` : "watching quietly"}{view.checking ? " · checking" : ""}</dd></div>
            <div><dt className="text-stone-500">Time</dt><dd>{clock(view.elapsedMs)} · {view.frames} frames · {view.screen?.item ?? view.screen?.name ?? "no screen yet"}</dd></div>
          </dl>
          {view.problem ? <p className="rounded border border-amber-300 bg-amber-50 p-2">{view.problem}</p> : null}

          {view.replay ? (
            <section className="rounded border-2 border-teal-700 p-3" data-testid="replay">
              <h2 className="font-semibold">What the expert did</h2>
              <p>Rule {view.replay.number}: {view.replay.statement}</p>
              <p className="text-stone-600">“{view.replay.quote.text}”</p>
              {view.replay.moment.picture ? (
                // A signed address from Tiro's own storage.
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="The expert's screen at that moment" className="mt-2 max-h-80 rounded border" src={view.replay.moment.picture} />
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="font-semibold">Said</h2>
              <ol className="max-h-96 space-y-1 overflow-y-auto">
                {view.spoken.map((line) => (
                  <li key={line.key}>{clock(line.start_ms)} <strong>{line.speaker === "agent" ? "Tiro" : "Learner"}:</strong> {line.text}</li>
                ))}
              </ol>
              {view.partial ? <p className="text-stone-500">Hearing: {view.partial}</p> : null}
            </section>
            <section>
              <h2 className="font-semibold">Caught</h2>
              <ol className="space-y-1">
                {view.catches.map((one, index) => (
                  <li key={index}>{clock(one.at)} Rule {one.rule.number}, {one.before_acting ? "before acting" : "after acting"}: {one.explanation ?? one.rule.statement}</li>
                ))}
              </ol>
              <h2 className="mt-4 font-semibold">Read from the screen</h2>
              <ol className="max-h-64 space-y-1 overflow-y-auto">
                {view.events.map((event) => <li key={event.id}>{clock(event.t_ms)} {describeEvent(event)}</li>)}
              </ol>
            </section>
          </div>

          {view.report ? (
            <section data-testid="report">
              <h2 className="font-semibold">Mastery report</h2>
              <ul className="space-y-1">
                {view.report.rules.map((rule) => (
                  <li key={rule.rule_id}><strong>{OUTCOME[rule.outcome]}</strong> · Rule {rule.number}: {rule.statement}</li>
                ))}
              </ul>
              <p className="mt-2">Practise next: {view.report.practise_next.length ? view.report.practise_next.map((number) => `rule ${number}`).join(", ") : "nothing"}</p>
            </section>
          ) : null}

          <section>
            <h2 className="font-semibold">The process being taught (version {view.workMap.version})</h2>
            <ol className="list-decimal pl-5">
              {view.workMap.steps.map((step) => <li key={step.id}>{step.title}: {step.decision}</li>)}
            </ol>
            <ul className="mt-2 list-disc pl-5">
              {view.workMap.rules.map((rule) => <li key={rule.id}>Rule {rule.number} ({rule.kind}): {rule.statement}</li>)}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
