"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  parseApiError,
  parseHomeData,
  type HomeData,
  type HomeWorkflow,
} from "@/app/home-data";
import { AppShell } from "./app-shell";

type AuthenticatedState =
  | { status: "loading" }
  | { status: "ready"; data: HomeData }
  | { status: "error"; message: string };

export function AuthenticatedApp({
  children,
  workflowId,
}: {
  children: (context: { data: HomeData; workflow?: HomeWorkflow }) => ReactNode;
  workflowId?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<AuthenticatedState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const apiError = parseApiError(payload);

        if (response.status === 401 && apiError?.code === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: apiError?.message ?? "Tiro couldn’t load this screen. Try again.",
          });
          return;
        }

        const data = parseHomeData(payload);
        setState(
          data
            ? { status: "ready", data }
            : {
                status: "error",
                message: "Tiro received an unexpected response. Refresh the page to try again.",
              },
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: "Tiro couldn’t connect. Check your connection and try again.",
        });
      });

    return () => controller.abort();
  }, [router]);

  if (state.status === "loading") {
    return <ScreenMessage message="Loading Tiro…" />;
  }
  if (state.status === "error") {
    return <ScreenMessage message={state.message} title="This screen didn’t load" />;
  }

  const workflow = workflowId
    ? state.data.workflows.find((item) => item.id === workflowId)
    : undefined;

  if (workflowId && !workflow) {
    return (
      <AppShell user={state.data.user}>
        <ScreenMessage
          embedded
          message="This workflow was not found, or it is not available to your account."
          title="Workflow unavailable"
        />
      </AppShell>
    );
  }

  return (
    <AppShell user={state.data.user} workflow={workflow}>
      {children({ data: state.data, workflow })}
    </AppShell>
  );
}

function ScreenMessage({
  embedded = false,
  message,
  title,
}: {
  embedded?: boolean;
  message: string;
  title?: string;
}) {
  const Wrapper = embedded ? "section" : "main";

  return (
    <Wrapper
      className={`grid place-items-center px-6 text-stone-950 ${embedded ? "min-h-[70dvh]" : "min-h-dvh bg-stone-50"}`}
    >
      <div className="max-w-md text-center">
        {title ? (
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        ) : (
          <span className="mx-auto block size-2 animate-pulse rounded-full bg-teal-800" />
        )}
        <p className={`${title ? "mt-3" : "mt-4"} text-sm leading-6 text-stone-600`}>
          {message}
        </p>
      </div>
    </Wrapper>
  );
}
