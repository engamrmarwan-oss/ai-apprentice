"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import {
  SCREEN_NAME_MAX,
  parseAdded,
  parseBaseline,
  parseSetupError,
  parseToolMap,
  processFileProblem,
  sourceLabel,
  statusLabel,
  type BaselineStatement,
  type BaselineStatus,
  type ToolMap,
  type ToolMapElement,
  type ToolMapScreen,
} from "./setup-data";

type Loaded<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

type CallResult =
  | { status: "ok"; payload: unknown }
  | { status: "signed_out" }
  | { status: "error"; message: string; fields: Record<string, string> };

const CONNECTION_ERROR = "Tiro couldn’t connect. Check your connection and try again.";
const UNEXPECTED = "Tiro received an unexpected response.";

export function SetupClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <SetupView workflowId={workflowId} />
        ) : (
          <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Expert access only</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Only the expert teaching this workflow can set up what Tiro knows before it watches.
              </p>
            </div>
          </div>
        )
      }
    </AuthenticatedApp>
  );
}

function SetupView({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const base = `/api/workflows/${encodeURIComponent(workflowId)}`;

  const call = useCallback(
    async (path: string, init?: RequestInit): Promise<CallResult> => {
      try {
        const response = await fetch(`${base}${path}`, {
          cache: "no-store",
          credentials: "same-origin",
          ...init,
          headers: init?.body ? { "Content-Type": "application/json" } : undefined,
        });
        const payload: unknown = await response.json().catch(() => null);
        const error = parseSetupError(payload);
        if (response.status === 401 && error?.code === "signed_out") {
          router.replace("/sign-in");
          return { status: "signed_out" };
        }
        if (!response.ok) {
          return {
            status: "error",
            message: error?.message ?? "Tiro couldn’t do that just now. Try again.",
            fields: error?.fields ?? {},
          };
        }
        return { status: "ok", payload };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return { status: "error", message: CONNECTION_ERROR, fields: {} };
      }
    },
    [base, router],
  );

  return (
    <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
      <header className="border-b border-stone-200 pb-9">
        <p className="text-sm font-semibold text-teal-800">Session setup</p>
        <h1 className="mt-2 text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">Setup</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
          What Tiro assumes about the task, and what it knows of the tool, before it watches you work.
        </p>
      </header>
      <BaselineSection call={call} />
      <ToolMapSection call={call} />
    </div>
  );
}

type Call = (path: string, init?: RequestInit) => Promise<CallResult>;

function BaselineSection({ call }: { call: Call }) {
  const [baseline, setBaseline] = useState<Loaded<BaselineStatement[]>>({ status: "loading" });
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    void call("/baseline").then((result) => {
      if (!live || result.status === "signed_out") return;
      if (result.status === "error") {
        setBaseline({ status: "error", message: result.message });
        return;
      }
      const statements = parseBaseline(result.payload);
      setBaseline(statements ? { status: "ready", data: statements } : { status: "error", message: UNEXPECTED });
    });
    return () => {
      live = false;
    };
  }, [attempt, call]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    setFormError(null);
    const chosen = event.target.files?.[0];
    if (!chosen) {
      setFile(null);
      return;
    }
    try {
      const text = await chosen.text();
      const problem = processFileProblem(chosen.name, text);
      if (problem) {
        setFile(null);
        setFileError(problem);
        event.target.value = "";
        return;
      }
      setFile({ name: chosen.name, text });
    } catch {
      setFile(null);
      setFileError("Tiro couldn’t read that file.");
      event.target.value = "";
    }
  }

  async function assemble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsAssembling(true);
    const result = await call("/baseline", {
      body: JSON.stringify(file ? { process_text: file.text } : {}),
      method: "POST",
    });
    setIsAssembling(false);
    if (result.status === "signed_out") return;
    if (result.status === "error") {
      if (result.fields.process_text) setFileError(result.fields.process_text);
      else setFormError(result.message);
      return;
    }
    const statements = parseBaseline(result.payload);
    if (!statements) {
      setFormError(UNEXPECTED);
      return;
    }
    setBaseline({ status: "ready", data: statements });
  }

  const statements = baseline.status === "ready" ? baseline.data : [];

  return (
    <section className="grid min-w-0 gap-8 border-b border-stone-200 py-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]" aria-labelledby="baseline-heading">
      <div className="min-w-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="baseline-heading">Baseline</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">
              What Tiro assumes about the task before it watches. It asks about what you do differently. A statement stays assumed until a Work Map bears it out.
            </p>
          </div>
          {baseline.status === "ready" ? (
            <span className="text-sm tabular-nums text-stone-500">{statements.length}</span>
          ) : null}
        </div>

        {baseline.status === "loading" ? (
          <p className="mt-5 text-sm text-stone-600" aria-live="polite">Loading baseline…</p>
        ) : baseline.status === "error" ? (
          <LoadError
            message={baseline.message}
            onRetry={() => {
              setBaseline({ status: "loading" });
              setAttempt((value) => value + 1);
            }}
            title="The baseline didn’t load"
          />
        ) : statements.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-6 text-sm leading-6 text-stone-600">
            No baseline yet. Assemble one, with your written process if you have it.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
            {statements.map((statement) => (
              <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4" key={statement.id}>
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-stone-900">{statement.text}</p>
                  <p className="mt-1 text-xs text-stone-500">Source: {sourceLabel(statement.source)}</p>
                </div>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(statement.status)}`}>
                  {statusLabel(statement.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="min-w-0">
        <form className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6" noValidate onSubmit={(event) => void assemble(event)}>
          <h3 className="text-xl font-semibold tracking-[-0.025em]">Your written process</h3>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Optional. A text or Markdown file of how your company says the task is done. Tiro keeps the statements it draws from it, not the file.
          </p>
          <label className="mt-4 block text-sm font-semibold text-stone-800" htmlFor="process-file">
            File
          </label>
          <input
            accept=".txt,.md,.markdown,text/plain,text/markdown"
            aria-describedby={fileError ? "process-file-error" : undefined}
            aria-invalid={Boolean(fileError)}
            className="mt-2 block w-full text-sm text-stone-700 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:text-sm file:font-semibold file:text-stone-800 hover:file:bg-stone-200"
            disabled={isAssembling}
            id="process-file"
            onChange={(event) => void chooseFile(event)}
            type="file"
          />
          {fileError ? (
            <p className="mt-1.5 text-xs font-medium text-red-700" id="process-file-error">{fileError}</p>
          ) : file ? (
            <p className="mt-1.5 text-xs text-stone-500">
              {file.name} · {file.text.length.toLocaleString()} characters
            </p>
          ) : null}
          {statements.length ? (
            <p className="mt-4 text-xs leading-5 text-stone-500">Assembling again replaces the baseline above.</p>
          ) : null}
          <button
            className="mt-4 h-11 w-full rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            disabled={isAssembling}
            type="submit"
          >
            {isAssembling ? "Assembling… up to half a minute" : file ? "Assemble with this file" : "Assemble without a file"}
          </button>
          {formError ? (
            <p className="mt-4 text-sm leading-6 text-red-700" role="alert">{formError}</p>
          ) : null}
        </form>
      </aside>
    </section>
  );
}

function ToolMapSection({ call }: { call: Call }) {
  const [toolMap, setToolMap] = useState<Loaded<ToolMap>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void call("/tool-map").then((result) => {
      if (!live || result.status === "signed_out") return;
      if (result.status === "error") {
        setToolMap({ status: "error", message: result.message });
        return;
      }
      const map = parseToolMap(result.payload);
      setToolMap(map ? { status: "ready", data: map } : { status: "error", message: UNEXPECTED });
    });
    return () => {
      live = false;
    };
  }, [attempt, call]);

  /** Sends a change and shows the tool map the route answers with. Returns the field errors, if any. */
  async function change(path: string, init: RequestInit) {
    setProblem(null);
    setNotice(null);
    const result = await call(path, init);
    if (result.status === "signed_out") return {};
    if (result.status === "error") {
      if (!Object.keys(result.fields).length) setProblem(result.message);
      return result.fields;
    }
    const map = parseToolMap(result.payload);
    if (!map) {
      setProblem(UNEXPECTED);
      return {};
    }
    setToolMap({ status: "ready", data: map });
    return null;
  }

  async function refresh() {
    setIsRefreshing(true);
    const result = await call("/tool-map", { method: "POST" });
    setIsRefreshing(false);
    if (result.status === "signed_out") return;
    if (result.status === "error") {
      setProblem(result.message);
      return;
    }
    const map = parseToolMap(result.payload);
    if (!map) {
      setProblem(UNEXPECTED);
      return;
    }
    setToolMap({ status: "ready", data: map });
    const added = parseAdded(result.payload) ?? 0;
    setNotice(
      added === 0
        ? "The tool map is up to date."
        : `Added ${added} ${added === 1 ? "thing" : "things"} Tiro read in your sessions.`,
    );
  }

  const screens = toolMap.status === "ready" ? toolMap.data.screens : [];

  return (
    <section className="py-9" aria-labelledby="tool-map-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="tool-map-heading">
            Tool map{toolMap.status === "ready" ? ` · ${toolMap.data.toolName}` : ""}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            The screens of the tool and what is on each, built from what Tiro read while you worked. Rename a screen so Tiro calls it what you do, hide one it should ignore, and mark fields that hold personal data.
          </p>
        </div>
        <button
          className="h-10 shrink-0 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-teal-700"
          disabled={isRefreshing || toolMap.status !== "ready"}
          onClick={() => void refresh()}
          type="button"
        >
          {isRefreshing ? "Bringing up to date…" : "Bring up to date"}
        </button>
      </div>

      {problem ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{problem}</p>
      ) : null}
      {notice ? (
        <p className="mt-5 text-sm leading-6 text-teal-800" aria-live="polite">{notice}</p>
      ) : null}

      {toolMap.status === "loading" ? (
        <p className="mt-5 text-sm text-stone-600" aria-live="polite">Loading tool map…</p>
      ) : toolMap.status === "error" ? (
        <LoadError
          message={toolMap.message}
          onRetry={() => {
            setToolMap({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
          title="The tool map didn’t load"
        />
      ) : screens.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-6 text-sm leading-6 text-stone-600">
          The tool map is empty until a session has run. Capture a session, then bring it up to date here.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {screens.map((screen) => (
            <ScreenCard
              key={`${screen.id}:${screen.name}`}
              onChange={change}
              screen={screen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ScreenCard({
  onChange,
  screen,
}: {
  onChange: (path: string, init: RequestInit) => Promise<Record<string, string> | null>;
  screen: ToolMapScreen;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(screen.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const path = `/tool-map/screens/${encodeURIComponent(screen.id)}`;

  async function rename(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Give the screen a name.");
      return;
    }
    setBusy(true);
    const fields = await onChange(path, { body: JSON.stringify({ name: trimmed }), method: "PATCH" });
    setBusy(false);
    if (fields) {
      setNameError(fields.name ?? null);
      return;
    }
    setRenaming(false);
  }

  async function toggleHidden() {
    setBusy(true);
    await onChange(path, { body: JSON.stringify({ hidden: !screen.hidden }), method: "PATCH" });
    setBusy(false);
  }

  return (
    <li className={`rounded-2xl border bg-white p-5 sm:p-6 ${screen.hidden ? "border-dashed border-stone-300" : "border-stone-200"}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {renaming ? (
          <form className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start" noValidate onSubmit={(event) => void rename(event)}>
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor={`screen-name-${screen.id}`}>Screen name</label>
              <input
                aria-describedby={nameError ? `screen-name-error-${screen.id}` : undefined}
                aria-invalid={Boolean(nameError)}
                autoFocus
                className={`h-10 w-full rounded-lg border px-3 text-base outline-none focus:ring-2 sm:text-sm ${
                  nameError ? "border-red-400 focus:ring-red-100" : "border-stone-300 focus:border-teal-700 focus:ring-teal-100"
                }`}
                id={`screen-name-${screen.id}`}
                maxLength={SCREEN_NAME_MAX}
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
              {nameError ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" id={`screen-name-error-${screen.id}`}>{nameError}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button className="h-10 rounded-lg bg-teal-900 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                className="h-10 rounded-lg px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                disabled={busy}
                onClick={() => {
                  setRenaming(false);
                  setName(screen.name);
                  setNameError(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className={`text-lg font-semibold tracking-[-0.02em] ${screen.hidden ? "text-stone-500" : "text-stone-950"}`}>
              {screen.name}
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              {screen.hidden
                ? "Hidden: left out of the baseline and of fixed checks."
                : `${screen.elements.length} ${screen.elements.length === 1 ? "element" : "elements"}`}
            </p>
          </div>
        )}
        {renaming ? null : (
          <div className="flex shrink-0 gap-1">
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 outline-none hover:bg-teal-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-700"
              disabled={busy}
              onClick={() => setRenaming(true)}
              type="button"
            >
              Rename
            </button>
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 outline-none hover:bg-stone-100 disabled:cursor-wait disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-700"
              disabled={busy}
              onClick={() => void toggleHidden()}
              type="button"
            >
              {screen.hidden ? "Show" : "Hide"}
            </button>
          </div>
        )}
      </div>

      {!screen.hidden && screen.elements.length ? (
        <ul className="mt-4 divide-y divide-stone-100 border-t border-stone-100">
          {screen.elements.map((element) => (
            <ElementRow element={element} key={element.id} onChange={onChange} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ElementRow({
  element,
  onChange,
}: {
  element: ToolMapElement;
  onChange: (path: string, init: RequestInit) => Promise<Record<string, string> | null>;
}) {
  const [busy, setBusy] = useState(false);
  const id = `personal-${element.id}`;

  async function togglePersonal() {
    setBusy(true);
    await onChange(`/tool-map/elements/${encodeURIComponent(element.id)}`, {
      body: JSON.stringify({ personal: !element.personal }),
      method: "PATCH",
    });
    setBusy(false);
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-stone-900">
          {element.label}
          <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">{kindLabel(element.kind)}</span>
        </p>
        {element.allowedValues?.length ? (
          <p className="mt-1 truncate text-xs text-stone-500">Seen as {element.allowedValues.join(", ")}</p>
        ) : null}
      </div>
      {element.kind === "button" ? null : (
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-stone-700" htmlFor={id}>
          <input
            checked={element.personal}
            className="size-4 accent-teal-800"
            disabled={busy}
            id={id}
            onChange={() => void togglePersonal()}
            type="checkbox"
          />
          Personal data
        </label>
      )}
    </li>
  );
}

function LoadError({ message, onRetry, title }: { message: string; onRetry: () => void; title: string }) {
  return (
    <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5">
      <h3 className="font-semibold text-red-950">{title}</h3>
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

function kindLabel(kind: ToolMapElement["kind"]) {
  return { button: "Button", field: "Field", status: "Status" }[kind];
}

function statusClass(status: BaselineStatus) {
  if (status === "confirmed") return "bg-teal-50 text-teal-900";
  if (status === "contradicted") return "bg-red-50 text-red-800";
  if (status === "not_observed") return "bg-stone-100 text-stone-600";
  return "bg-amber-50 text-amber-900";
}
