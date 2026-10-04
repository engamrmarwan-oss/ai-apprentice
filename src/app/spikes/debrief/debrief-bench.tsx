"use client";

// A bare page that runs one debrief end to end, before the product's debrief
// screen exists: pick a session whose task has ended, start, answer Tiro's
// questions, hear the Work Map back, correct or confirm it.
import { useEffect, useRef, useState } from "react";
import { createDebriefEngine, EMPTY_DEBRIEF, type DebriefEngine, type DebriefView } from "@/capture/debrief";

type Waiting = { id: string; workflow: string; created_at: string };
type Me = { state: "loading" } | { state: "signed_out" } | { state: "signed_in"; name: string; waiting: Waiting[] };

const button = "rounded border px-3 py-2 disabled:opacity-40";
const input = "rounded border px-2 py-1";

async function get(path: string) {
  const response = await fetch(path, { credentials: "same-origin" }).catch(() => null);
  const answer = await response?.json().catch(() => null);
  return response?.ok && answer?.ok ? answer : null;
}

/** Who is signed in, and which of their sessions are waiting for a debrief. */
async function load(): Promise<Me> {
  const me = await get("/api/me");
  if (!me) return { state: "signed_out" };
  const waiting: Waiting[] = [];
  for (const workflow of me.workflows as { id: string; task: string; role: string; tool: { name: string } }[]) {
    if (workflow.role !== "expert") continue;
    const listed = await get(`/api/workflows/${workflow.id}/sessions`);
    for (const session of (listed?.sessions ?? []) as { id: string; phase: string; created_at: string }[]) {
      if (session.phase === "debrief") waiting.push({ id: session.id, workflow: `${workflow.tool.name}: ${workflow.task}`, created_at: session.created_at });
    }
  }
  return { state: "signed_in", name: me.user.name, waiting };
}

export function DebriefBench() {
  const [me, setMe] = useState<Me>({ state: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DebriefView>(EMPTY_DEBRIEF);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const engine = useRef<DebriefEngine | null>(null);

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

  const begin = (id: string) => {
    engine.current = createDebriefEngine(id, setView);
    setSessionId(id);
    void engine.current.start();
  };

  const map = view.workMap;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Debrief bench</h1>
        <p className="text-stone-600">A bare test page. It runs the debrief of a session whose task has ended.</p>
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

      {me.state === "signed_in" && !sessionId ? (
        <section className="space-y-2">
          <p>Signed in as {me.name}. Sessions waiting for their debrief:</p>
          {me.waiting.length === 0 ? <p className="text-stone-600">None. End a task on the capture screen first.</p> : null}
          <ul className="space-y-2">
            {me.waiting.map((session) => (
              <li className="flex items-center gap-3" key={session.id}>
                <button className={button} onClick={() => begin(session.id)} type="button">Start the debrief</button>
                <span>{session.workflow} · {new Date(session.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sessionId ? (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded border p-3">
            <strong data-testid="phase">{view.phase}</strong>
            <span>voice: {view.voice}{view.agentSpeaking ? " · Tiro is speaking" : ""}</span>
            <span>second reading: {view.verified} verified, {view.doubted} doubted</span>
            <button className={button} disabled={view.voice !== "on"} onClick={() => engine.current?.setMuted(!view.muted)} type="button">
              {view.muted ? "Unmute" : "Mute"}
            </button>
            <button className={button} disabled={view.phase !== "asking"} onClick={() => void engine.current?.build()} type="button">
              I have answered: build the map
            </button>
            <button className={button} disabled={view.phase !== "teach_back"} onClick={() => void engine.current?.confirm()} type="button">
              Confirm the map
            </button>
          </section>
          {view.problem ? <p className="rounded border border-amber-300 bg-amber-50 p-2">{view.problem}</p> : null}

          <div className="grid gap-6 md:grid-cols-2">
            <section>
              <h2 className="font-semibold">Tiro asks aloud ({view.ask.length})</h2>
              <ol className="list-decimal space-y-1 pl-5">
                {view.ask.map((question) => <li key={question.id}>{question.text} <span className="text-stone-500">({question.kind})</span></li>)}
              </ol>
              <h2 className="mt-4 font-semibold">Also wondered about ({view.listed.length})</h2>
              <ul className="space-y-1">
                {view.listed.map((question) => (
                  <li className="flex gap-2" key={question.id}>
                    <button className="underline" onClick={() => engine.current?.dismiss(question.id)} type="button">dismiss</button>
                    <span>{question.text}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="font-semibold">Said</h2>
              <ol className="max-h-96 space-y-1 overflow-y-auto">
                {view.spoken.map((line) => (
                  <li key={line.key}><strong>{line.speaker === "agent" ? "Tiro" : "Expert"}:</strong> {line.text}</li>
                ))}
              </ol>
            </section>
          </div>

          {map ? (
            <section className="space-y-3">
              <h2 className="font-semibold">Work Map, version {map.version} · <span data-testid="map-status">{map.status}</span></h2>
              <ol className="space-y-3">
                {map.steps.map((step) => (
                  <li className="rounded border p-3" key={step.id}>
                    <div className="flex gap-3">
                      {step.moment?.picture ? (
                        // A signed address from Tiro's own storage.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" className="h-24 w-40 flex-none rounded border object-cover object-top" src={step.moment.picture} />
                      ) : null}
                      <div>
                        <p className="font-semibold">{step.position}. {step.title}{step.is_judgment ? " · judgment" : ""}</p>
                        <p>{step.decision}</p>
                        <p className="text-stone-600">{step.reason ? `“${step.reason.text}”` : "No reason given yet."}</p>
                        {map.rules.filter((rule) => rule.steps.includes(step.position)).map((rule) => (
                          <p className="mt-1 border-l-2 pl-2" key={rule.id}>
                            Rule {rule.number} ({rule.kind}, {rule.action.type}, {rule.provenance}, v{rule.version}): {rule.statement}
                            <span className="block text-stone-600">“{rule.quote.text}”</span>
                          </p>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              {view.leftOut.length > 0 ? (
                <div>
                  <h3 className="font-semibold">Left out by the validator</h3>
                  <ul className="list-disc pl-5">
                    {view.leftOut.map((one, index) => <li key={index}>{one.what}: {one.text}. {one.why}</li>)}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
