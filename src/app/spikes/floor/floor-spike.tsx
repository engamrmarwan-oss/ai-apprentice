"use client";

import { useRef, useState } from "react";
import { nextStep } from "./guide";
import { createFloorHarness, EMPTY_VIEW, type FloorHarness, type FloorVariables, type FloorView } from "./harness";
import { summarize, type Entry } from "./summary";

// Neutral stand-ins for a real session's values. The test is about turn-taking, not about any one tool.
const DEFAULTS: FloorVariables = {
  tool_name: "a web application",
  task: "a routine review of items in a list",
  expert_role: "an experienced reviewer",
  baseline: "Nothing is assumed yet.",
};

const SENTENCES = [
  "I am reading the next item in the list.",
  "This one looks fine to me, so I will carry on.",
  "What do you think about this one?",
];

const UPDATES = [
  "Screen: the expert opened an item.",
  "Screen: the expert changed a field on the open item.",
  "Screen: the expert scrolled down the list.",
  "The expert said: this one looks fine to me.",
  "Screen: the expert saved the open item.",
];

const QUESTIONS = [
  "Why did you decide that just now?",
  "What would have made you decide differently?",
  "When would you stop and ask someone before doing that?",
];

const clock = (ms: number) => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

function describe(entry: Entry): string {
  switch (entry.kind) {
    case "status":
      return entry.status;
    case "floor":
      return entry.open ? "floor opened" : `floor closed (${entry.reason})`;
    case "agent_speaking":
      return entry.speaking ? "Tiro starts speaking" : "Tiro stops speaking";
    case "agent_said":
      return `Tiro: ${entry.text}`;
    case "agent_heard":
      return `Tiro heard: ${entry.text}`;
    case "context_sent":
      return `screen update sent: ${entry.text}`;
    case "trigger_sent":
      return `trigger sent: ${entry.text}`;
    case "tool_call":
      return `Tiro called ${entry.name}`;
    case "scribe_partial":
    case "scribe_committed":
      return `Scribe: ${entry.text}`;
    case "error":
      return `error: ${entry.message}`;
  }
}

function save(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function FloorSpike() {
  const harnessRef = useRef<FloorHarness | null>(null);
  const [view, setView] = useState<FloorView>(EMPTY_VIEW);
  const [variables, setVariables] = useState<FloorVariables>(DEFAULTS);
  const [error, setError] = useState<string | null>(null);

  function harness() {
    harnessRef.current ??= createFloorHarness(setView);
    return harnessRef.current;
  }

  async function attempt(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function download() {
    const result = harness().result();
    if (!result) return;
    save(JSON.stringify(result, null, 1), `tiro-s2-${result.startedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`);
  }

  const running = view.state === "running";
  const summary = summarize(view.entries);
  const updatesSent = summary.contextUpdates.sent;
  const asked = summary.triggers.sent;
  const step = nextStep(view.state, view.floorOpen, view.entries, SENTENCES);
  const button = "rounded border px-3 py-2 text-sm disabled:opacity-40";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 text-sm">
      <header>
        <h1 className="text-xl font-semibold">Spike S2: the floor</h1>
        <p className="mt-1 opacity-70">
          A test page, not a product screen. It checks that Tiro stays silent and deaf while you work, asks one
          question when told to, gives the floor back, and never writes down its own voice.
        </p>
      </header>

      <p>
        Before you start: open your <b>expert link</b> once in this browser, and use the laptop&apos;s
        <b> speakers, not headphones</b>. The run takes about three minutes. Follow the box below, one step at a time.
      </p>

      <section className="rounded border-2 border-blue-600 p-4" aria-live="polite">
        <p className="text-xs uppercase tracking-wide opacity-60">Do this now</p>
        <p className="mt-1 text-base font-semibold">{step.title}</p>
        {step.say && <p className="mt-2 text-lg">&ldquo;{step.say}&rdquo;</p>}
        {step.detail && <p className="mt-2 opacity-70">{step.detail}</p>}
      </section>

      <details>
        <summary className="cursor-pointer opacity-70">Session values given to the agent</summary>
        <div className="mt-2 grid gap-2">
          {(Object.keys(DEFAULTS) as (keyof FloorVariables)[]).map((name) => (
            <label key={name} className="grid gap-1">
              <span className="font-mono opacity-60">{name}</span>
              <input
                className="rounded border px-2 py-1"
                value={variables[name]}
                disabled={running}
                onChange={(event) => setVariables({ ...variables, [name]: event.target.value })}
              />
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={running || view.state === "starting"}
          onClick={() => attempt(() => harness().start(variables))}
        >
          {view.state === "starting" ? "Starting…" : "Start"}
        </button>
        <button
          className={button}
          disabled={!running || view.floorOpen}
          onClick={() => harness().sendContext(UPDATES[updatesSent % UPDATES.length])}
        >
          Send a screen update ({updatesSent} of 5)
        </button>
        <button
          className={button}
          disabled={!running || view.floorOpen}
          onClick={() => harness().ask(QUESTIONS[asked % QUESTIONS.length])}
        >
          Ask a question ({asked} of 3)
        </button>
        <button className={button} disabled={!view.floorOpen} onClick={() => harness().closeFloor("button")}>
          Close the floor
        </button>
        <button className={button} disabled={!running} onClick={() => attempt(() => harness().stop())}>
          {running && !step.done ? "Stop early" : "Stop"}
        </button>
        <button className={button} disabled={view.state !== "stopped"} onClick={download}>
          Download results
        </button>
      </div>

      {error && <p className="rounded border border-red-500 p-3 text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 font-semibold">Live</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          <Stat label="State" value={view.state} />
          <Stat label="Floor" value={view.floorOpen ? "open" : "closed"} />
          <Stat label="Tiro" value={view.agentSpeaking ? "speaking" : "quiet"} />
          <Stat label="Tiro's microphone" value={view.floorOpen ? "on" : "muted"} />
        </dl>
        <p className="mt-2 min-h-5 opacity-70">{view.partial ? `Scribe is hearing: ${view.partial}` : ""}</p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Checks</h2>
        <ul className="space-y-1">
          {summary.checks.map((check) => (
            <li key={check.label}>
              <span className={check.pass ? "text-green-700" : "opacity-60"}>{check.pass ? "pass" : "not yet"}</span>
              {" · "}
              {check.label}
              <span className="opacity-60"> · {check.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Log</h2>
        <ol className="max-h-80 space-y-0.5 overflow-y-auto font-mono text-xs">
          {[...view.entries].reverse().map((entry, index) => (
            <li key={view.entries.length - index}>
              <span className="opacity-50">{clock(entry.t)}</span> {describe(entry)}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="opacity-60">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
