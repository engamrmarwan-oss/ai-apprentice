"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { Icon } from "@/components/ui/icon";
import {
  KEY_NAME_MAX,
  connectionBlock,
  keyNameProblem,
  parseAgentKeys,
  parseAgentKeysError,
  parseNewAgentKey,
  type AgentKey,
  type AgentKeysData,
  type NewAgentKey,
} from "./agents-data";

type KeysState =
  | { status: "loading" }
  | { status: "ready"; data: AgentKeysData }
  | { status: "error"; message: string };

type KeysRequestResult = { status: "signed_out" } | Exclude<KeysState, { status: "loading" }>;

const CONNECTION_ERROR = "Tiro couldn’t connect. Check your connection and try again.";

export function AgentsClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <AgentsView workflowId={workflowId} />
        ) : (
          <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Expert access only</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Only the expert teaching this workflow can give agents access to its Work Map.
              </p>
            </div>
          </div>
        )
      }
    </AuthenticatedApp>
  );
}

function AgentsView({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [state, setState] = useState<KeysState>({ status: "loading" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  // The secret lives here and nowhere else: never in storage, a URL or a log.
  const [created, setCreated] = useState<NewAgentKey | null>(null);

  const applyResult = useCallback(
    (result: KeysRequestResult) => {
      if (result.status === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      setState(result);
    },
    [router],
  );

  const loadKeys = useCallback(
    (signal?: AbortSignal) =>
      requestKeys(workflowId, signal).then(applyResult, (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: CONNECTION_ERROR });
      }),
    [applyResult, workflowId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadKeys(controller.signal);
    return () => controller.abort();
  }, [loadKeys]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "");
    setFormError(null);
    setNotice(null);
    const problem = keyNameProblem(name);
    setNameError(problem);
    if (problem) return;

    setIsCreating(true);
    try {
      const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/agent-keys`, {
        body: JSON.stringify({ name: name.trim() }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      const apiError = parseAgentKeysError(payload);
      if (response.status === 401 && apiError?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setNameError(apiError?.fields.name ?? null);
        setFormError(apiError?.fields.name ? null : (apiError?.message ?? "Tiro couldn’t make that key."));
        return;
      }
      const made = parseNewAgentKey(payload);
      if (!made) {
        setFormError("Tiro returned an unexpected response.");
        return;
      }
      form.reset();
      setCreated(made);
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              data: { keys: [...current.data.keys, made.key], serverUrl: made.serverUrl },
            }
          : current,
      );
    } catch {
      setFormError(CONNECTION_ERROR);
    } finally {
      setIsCreating(false);
    }
  }

  async function withdraw(keyId: string) {
    setFormError(null);
    setNotice(null);
    setWithdrawingId(keyId);
    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/agent-keys/${encodeURIComponent(keyId)}`,
        { credentials: "same-origin", method: "DELETE" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const apiError = parseAgentKeysError(payload);
      if (response.status === 401 && apiError?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok && apiError?.code !== "not_found") {
        setFormError(apiError?.message ?? "Tiro couldn’t withdraw that key.");
        return;
      }
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              data: { ...current.data, keys: current.data.keys.filter((key) => key.id !== keyId) },
            }
          : current,
      );
      if (created?.key.id === keyId) setCreated(null);
      setConfirmingId(null);
      setNotice("Key withdrawn. An agent that uses it is refused from now on.");
    } catch {
      setFormError(CONNECTION_ERROR);
    } finally {
      setWithdrawingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
      <header className="border-b border-stone-200 pb-9">
        <p className="text-sm font-semibold text-teal-800">Agents outside Tiro</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Agents</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
          Give an AI agent a key so it can read this workflow’s confirmed Work Map, do the task the way you do, and stop where you would. A key reads only this workflow, never drafts.
        </p>
      </header>

      {created ? <NewKeyPanel created={created} onDone={() => setCreated(null)} /> : null}

      <section className="grid min-w-0 gap-8 py-9 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="min-w-0">
          {state.status === "loading" ? (
            <p className="text-sm text-stone-600" aria-live="polite">Loading keys…</p>
          ) : state.status === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <h2 className="font-semibold text-red-950">Keys didn’t load</h2>
              <p className="mt-2 text-sm leading-6 text-red-800">{state.message}</p>
              <button
                className="mt-4 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-red-800 outline-none hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-700"
                onClick={() => {
                  setState({ status: "loading" });
                  void loadKeys();
                }}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : (
            <KeyList
              confirmingId={confirmingId}
              keys={state.data.keys}
              onCancel={() => setConfirmingId(null)}
              onConfirm={(keyId) => void withdraw(keyId)}
              onWithdraw={setConfirmingId}
              withdrawingId={withdrawingId}
            />
          )}
        </div>

        <aside className="min-w-0">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-900">
                <Icon className="size-5" name="key" />
              </span>
              <h2 className="text-xl font-semibold tracking-[-0.025em]">New key</h2>
            </div>
            <form className="mt-5" noValidate onSubmit={(event) => void createKey(event)}>
              <label className="text-sm font-semibold text-stone-800" htmlFor="key-name">
                Name
              </label>
              <input
                aria-describedby={nameError ? "key-name-error" : "key-name-help"}
                aria-invalid={Boolean(nameError)}
                autoComplete="off"
                className={`mt-2 h-11 w-full rounded-lg border px-3 text-base outline-none focus:ring-2 sm:text-sm ${
                  nameError
                    ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                    : "border-stone-300 focus:border-teal-700 focus:ring-teal-100"
                }`}
                id="key-name"
                maxLength={KEY_NAME_MAX}
                name="name"
                placeholder="My agent"
                type="text"
              />
              {nameError ? (
                <p className="mt-1.5 text-xs font-medium text-red-700" id="key-name-error">
                  {nameError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-stone-500" id="key-name-help">
                  So you can tell your keys apart. Up to {KEY_NAME_MAX} characters.
                </p>
              )}
              <button
                className="mt-4 h-11 w-full rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
                disabled={isCreating || state.status !== "ready"}
                type="submit"
              >
                {isCreating ? "Making key…" : "Make key"}
              </button>
            </form>
            {formError ? (
              <p className="mt-4 text-sm leading-6 text-red-700" role="alert">
                {formError}
              </p>
            ) : null}
            {notice ? (
              <p className="mt-4 text-sm leading-6 text-teal-800" aria-live="polite">
                {notice}
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  );
}

function NewKeyPanel({ created, onDone }: { created: NewAgentKey; onDone: () => void }) {
  const block = connectionBlock(created.serverUrl, created.secret);
  return (
    <section
      aria-labelledby="new-key-heading"
      className="mt-9 rounded-2xl border border-teal-200 bg-teal-50/60 p-5 sm:p-6"
    >
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-teal-950" id="new-key-heading">
        Key “{created.key.name}” is ready
      </h2>
      <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        Copy the key now. Tiro keeps only a fingerprint of it, so it cannot be shown again. If you lose it, withdraw it and make a new one.
      </p>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-800">Key</h3>
          <CopyButton label="Copy key" value={created.secret} />
        </div>
        <code className="mt-2 block overflow-x-auto rounded-lg border border-stone-200 bg-white px-3 py-2.5 font-mono text-sm break-all text-stone-900">
          {created.secret}
        </code>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-stone-800">Connection for your agent</h3>
          <CopyButton label="Copy connection" value={block} />
        </div>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          For an agent that takes its MCP servers as JSON. It connects to {created.serverUrl} and sends the key as a bearer token.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-stone-200 bg-white px-3 py-2.5 font-mono text-xs leading-5 text-stone-900">
          {block}
        </pre>
      </div>

      <button
        className="mt-5 h-10 rounded-lg bg-white px-4 text-sm font-semibold text-teal-900 outline-none ring-1 ring-teal-200 hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700"
        onClick={onDone}
        type="button"
      >
        I’ve copied it
      </button>
    </section>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      className="rounded-lg px-3 py-1.5 text-sm font-semibold text-teal-900 outline-none hover:bg-teal-100 focus-visible:ring-2 focus-visible:ring-teal-700"
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => setCopied("yes"),
          () => setCopied("failed"),
        );
      }}
      type="button"
    >
      <span aria-live="polite">
        {copied === "yes" ? "Copied" : copied === "failed" ? "Select and copy it" : label}
      </span>
    </button>
  );
}

function KeyList({
  confirmingId,
  keys,
  onCancel,
  onConfirm,
  onWithdraw,
  withdrawingId,
}: {
  confirmingId: string | null;
  keys: AgentKey[];
  onCancel: () => void;
  onConfirm: (keyId: string) => void;
  onWithdraw: (keyId: string) => void;
  withdrawingId: string | null;
}) {
  return (
    <section aria-labelledby="keys-heading">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="keys-heading">
            Keys
          </h2>
          <p className="mt-2 text-sm text-stone-600">Keys that still work.</p>
        </div>
        <span className="text-sm tabular-nums text-stone-500">{keys.length}</span>
      </div>
      {keys.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-6 text-sm leading-6 text-stone-600">
          No agent can read this workflow yet. Make a key to give one access.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {keys.map((key) => (
            <li className="py-4" key={key.id}>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-900">
                    {key.name}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Ends in <span className="font-mono">{key.hint}</span> · Made {formatDate(key.createdAt)} ·{" "}
                    {key.lastUsedAt ? `Last used ${formatDate(key.lastUsedAt)}` : "Never used"}
                  </span>
                </span>
                {confirmingId !== key.id ? (
                  <button
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-700"
                    onClick={() => onWithdraw(key.id)}
                    type="button"
                  >
                    Withdraw
                  </button>
                ) : null}
              </div>
              {confirmingId === key.id ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="group" aria-label={`Withdraw ${key.name}`}>
                  <p className="text-sm leading-6 text-red-900">
                    Withdraw this key? Any agent that uses it is refused from then on. This cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="h-9 rounded-lg bg-red-700 px-3 text-sm font-semibold text-white outline-none hover:bg-red-800 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
                      disabled={withdrawingId === key.id}
                      onClick={() => onConfirm(key.id)}
                      type="button"
                    >
                      {withdrawingId === key.id ? "Withdrawing…" : "Withdraw key"}
                    </button>
                    <button
                      className="h-9 rounded-lg bg-white px-3 text-sm font-semibold text-stone-700 outline-none ring-1 ring-stone-200 hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-teal-700"
                      disabled={withdrawingId === key.id}
                      onClick={onCancel}
                      type="button"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function requestKeys(workflowId: string, signal?: AbortSignal): Promise<KeysRequestResult> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/agent-keys`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const apiError = parseAgentKeysError(payload);
  if (response.status === 401 && apiError?.code === "signed_out") return { status: "signed_out" };
  if (!response.ok) {
    return { status: "error", message: apiError?.message ?? "Tiro couldn’t load this workflow’s keys." };
  }
  const data = parseAgentKeys(payload);
  return data
    ? { status: "ready", data }
    : { status: "error", message: "Tiro received an unexpected response." };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
