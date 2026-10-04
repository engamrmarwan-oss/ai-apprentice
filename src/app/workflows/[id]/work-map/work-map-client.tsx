"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkMap } from "@/capture/debrief";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { RuleDetail } from "@/components/work-map/rule-detail";
import { WorkMapTimeline } from "@/components/work-map/work-map-timeline";

type MapState =
  | { state: "loading" }
  | { state: "ready"; map: WorkMap | null }
  | { state: "error"; message: string };

export function WorkMapClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) => (
        <WorkMapScreen isExpert={workflow?.role === "expert"} workflowId={workflowId} />
      )}
    </AuthenticatedApp>
  );
}

function WorkMapScreen({ isExpert, workflowId }: { isExpert: boolean; workflowId: string }) {
  const router = useRouter();
  const [mapState, setMapState] = useState<MapState>({ state: "loading" });
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/workflows/${encodeURIComponent(workflowId)}/work-map`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (response.status === 401 && routeErrorCode(payload) === "signed_out") {
          router.replace("/sign-in");
          return;
        }
        if (!response.ok) {
          setMapState({
            state: "error",
            message: routeErrorMessage(payload) ?? "Tiro couldn’t load this Work Map.",
          });
          return;
        }

        const map = readWorkMap(payload);
        setMapState({ state: "ready", map });
        setSelectedRuleId((current) =>
          current && map?.rules.some((rule) => rule.id === current)
            ? current
            : (map?.rules[0]?.id ?? null),
        );
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setMapState({
          state: "error",
          message: "Tiro couldn’t connect. Check your connection and try again.",
        });
      });

    return () => controller.abort();
  }, [requestKey, router, workflowId]);

  if (mapState.state === "loading") {
    return <CenteredStatus title="Loading Work Map…" />;
  }

  if (mapState.state === "error") {
    return (
      <CenteredStatus
        action="Try again"
        message={mapState.message}
        onAction={() => {
          setMapState({ state: "loading" });
          setRequestKey((key) => key + 1);
        }}
        title="The Work Map didn’t load"
      />
    );
  }

  if (!mapState.map) {
    return (
      <CenteredStatus
        action={isExpert ? "Start capturing" : undefined}
        message={
          isExpert
            ? "Capture a session and confirm its debrief to make the first version of this workflow’s Work Map."
            : "The expert has not confirmed a Work Map for this workflow yet. It will appear here when they do, and then you can practise it with the tutor."
        }
        onAction={isExpert ? () => router.push(`/workflows/${encodeURIComponent(workflowId)}/capture`) : undefined}
        title="No Work Map yet"
      />
    );
  }

  const map = mapState.map;
  const selectedRule =
    map.rules.find((rule) => rule.id === selectedRuleId) ?? map.rules[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-9 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Work Map
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            The steps, decisions, reasons, and rules Tiro learned from the expert.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-600">
          <span className="rounded-full bg-teal-50 px-3 py-1.5 font-semibold text-teal-900">
            {label(map.status)}
          </span>
          <span>Version {map.version}</span>
        </div>
      </header>

      <div className="grid min-w-0 gap-10 py-9 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <WorkMapTimeline
          map={map}
          onSelectRule={(rule) => setSelectedRuleId(rule.id)}
          selectedRuleId={selectedRule?.id ?? null}
        />
        {selectedRule ? (
          <RuleDetail rule={selectedRule} />
        ) : (
          <aside className="rounded-2xl border border-dashed border-stone-300 p-6 text-sm leading-6 text-stone-600">
            This Work Map does not contain any rules yet.
          </aside>
        )}
      </div>
    </div>
  );
}

function CenteredStatus({
  action,
  message,
  onAction,
  title,
}: {
  action?: string;
  message?: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">{title}</h1>
        {message ? <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p> : null}
        {action && onAction ? (
          <button
            className="mt-6 h-10 rounded-lg bg-teal-900 px-4 text-sm font-semibold text-white outline-none hover:bg-teal-950 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            onClick={onAction}
            type="button"
          >
            {action}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function readWorkMap(value: unknown): WorkMap | null {
  if (!isRecord(value) || !("work_map" in value)) return null;
  const map = value.work_map;
  if (map === null) return null;
  if (!isRecord(map) || !Array.isArray(map.steps) || !Array.isArray(map.rules)) return null;
  return map as WorkMap;
}

function routeErrorCode(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  return error && typeof error.code === "string" ? error.code : null;
}

function routeErrorMessage(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  return error && typeof error.message === "string" ? error.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
