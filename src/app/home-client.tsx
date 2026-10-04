"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { Icon } from "@/components/ui/icon";
import {
  groupWorkflows,
  parseApiError,
  parseHomeData,
  type HomeData,
  type HomeWorkflow,
} from "./home-data";

type HomeState =
  | { status: "loading" }
  | { status: "ready"; data: HomeData }
  | { status: "error"; message: string };

type HomeRequestResult =
  | { status: "ready"; data: HomeData }
  | { status: "signed_out" }
  | { status: "error"; message: string };

async function requestHome(signal?: AbortSignal): Promise<HomeRequestResult> {
  const response = await fetch("/api/me", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const apiError = parseApiError(payload);

  if (response.status === 401 && apiError?.code === "signed_out") {
    return { status: "signed_out" };
  }
  if (!response.ok) {
    return {
      status: "error",
      message: apiError?.message ?? "Tiro couldn’t load your workflows. Try again.",
    };
  }

  const data = parseHomeData(payload);
  return data
    ? { status: "ready", data }
    : {
        status: "error",
        message: "Tiro received an unexpected response. Refresh the page to try again.",
      };
}

export function HomeClient() {
  const router = useRouter();
  const [state, setState] = useState<HomeState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void requestHome(controller.signal).then(
      (result) => {
        if (result.status === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        setState(result);
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: "Tiro couldn’t load your workflows. Check your connection and try again.",
        });
      },
    );
    return () => controller.abort();
  }, [router]);

  function retry() {
    setState({ status: "loading" });
    void requestHome().then(
      (result) => {
        if (result.status === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        setState(result);
      },
      () =>
        setState({
          status: "error",
          message: "Tiro couldn’t load your workflows. Check your connection and try again.",
        }),
    );
  }

  if (state.status === "loading") return <HomeLoading />;
  if (state.status === "error") {
    return <HomeError message={state.message} onRetry={retry} />;
  }

  const { learning, teaching } = groupWorkflows(state.data.workflows);
  const firstName = state.data.user.name.trim().split(/\s+/)[0] || state.data.user.name;

  return (
    <AppShell user={state.data.user}>
      <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
        <header className="flex flex-col gap-8 border-y border-stone-200 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="max-w-3xl text-4xl leading-[1.12] font-medium tracking-[-0.025em] text-balance sm:text-[2.75rem]">
              Welcome, {firstName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Teach Tiro how you make decisions, or continue learning from an
              expert’s confirmed Work Map.
            </p>
            <p className="mt-5 flex items-center gap-2 text-[0.625rem] font-bold tracking-[0.11em] text-stone-500 uppercase">
              <span>Screen</span><span className="h-px w-5 bg-amber-500" />
              <span>Reason</span><span className="h-px w-5 bg-amber-500" />
              <span>Rule</span>
            </p>
          </div>
          <Link
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-teal-900 px-5 text-xs font-bold text-white outline-none transition-colors hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
            href="/workflows/new"
          >
            <Icon className="size-4" name="plus" />
            Teach Tiro a workflow
          </Link>
        </header>

        <div className="divide-y divide-stone-200">
          <WorkflowSection
            description="Workflows where Tiro learns your decisions and guardrails."
            emptyAction
            emptyCopy="Create a workflow to start teaching Tiro how you do the work."
            title="Workflows you teach"
            workflows={teaching}
          />
          <WorkflowSection
            description="Workflows where an expert has invited you to practise."
            emptyCopy="You are not learning any workflows yet. An expert can invite you from their workflow’s People screen."
            title="Workflows you are learning"
            workflows={learning}
          />
        </div>
      </div>
    </AppShell>
  );
}

function WorkflowSection({
  description,
  emptyAction = false,
  emptyCopy,
  title,
  workflows,
}: {
  description: string;
  emptyAction?: boolean;
  emptyCopy: string;
  title: string;
  workflows: HomeWorkflow[];
}) {
  return (
    <section className="py-8" aria-labelledby={`${title.replaceAll(" ", "-")}-heading`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className="text-sm font-bold tracking-[-0.01em]"
            id={`${title.replaceAll(" ", "-")}-heading`}
          >
            {title}
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-stone-600">{description}</p>
        </div>
        {workflows.length > 0 ? (
          <span className="w-fit rounded-full border border-stone-300 px-2 py-0.5 text-[0.625rem] font-bold tabular-nums text-stone-500">
            {workflows.length} {workflows.length === 1 ? "workflow" : "workflows"}
          </span>
        ) : null}
      </div>

      {workflows.length > 0 ? (
        <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {workflows.map((workflow) => (
            <li key={workflow.id}>
              <Link
                className="group grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 px-2 py-3 outline-none hover:bg-white/70 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-inset sm:grid-cols-[2.75rem_minmax(0,1fr)_auto_minmax(8rem,0.35fr)_1rem] sm:px-3"
                href={`/workflows/${encodeURIComponent(workflow.id)}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-amber-50 text-xs font-extrabold tracking-[0.06em] text-teal-950">
                  {workflow.tool.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-stone-950">
                    {workflow.task}
                  </span>
                  <span className="mt-1 block truncate text-[0.625rem] text-stone-500">
                    {workflow.tool.name}
                  </span>
                </span>
                <span className="hidden rounded-full bg-stone-100 px-2.5 py-1 text-[0.625rem] font-bold text-stone-600 sm:inline-flex">
                  {workflow.role === "expert" ? "Expert" : "New hire"}
                </span>
                <span className="hidden text-[0.625rem] text-stone-500 sm:block">
                  {workflow.role === "expert" ? "Continue teaching" : "Continue learning"}
                </span>
                <Icon
                  className="size-4 shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-800"
                  name="chevron-right"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 flex flex-col items-start gap-4 rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-xs leading-5 text-stone-600">{emptyCopy}</p>
          {emptyAction ? (
            <Link
              className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-bold text-teal-900 outline-none hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-blue-700"
              href="/workflows/new"
            >
              <Icon className="size-4" name="plus" />
              Teach Tiro a workflow
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function HomeLoading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-stone-50 px-6 text-stone-950">
      <div
        aria-live="polite"
        className="flex items-center gap-3 text-sm text-stone-600"
      >
        <span className="size-2 animate-pulse rounded-full bg-teal-800" />
        Loading your workflows…
      </div>
    </main>
  );
}

function HomeError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-stone-50 px-6 text-stone-950">
      <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8">
        <h1 className="text-2xl font-semibold tracking-[-0.025em]">
          Your workflows didn’t load
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>
        <button
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
