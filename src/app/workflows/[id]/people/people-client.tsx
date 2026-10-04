"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { Icon } from "@/components/ui/icon";
import {
  parseInviteStatus,
  parsePeopleData,
  parsePeopleError,
  type PeopleData,
} from "./people-data";

type PeopleState =
  | { status: "loading" }
  | { status: "ready"; data: PeopleData }
  | { status: "error"; message: string };

type PeopleRequestResult =
  | { status: "ready"; data: PeopleData }
  | { status: "signed_out" }
  | { status: "error"; message: string };

export function PeopleClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <PeopleView workflowId={workflowId} />
        ) : (
          <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Expert access only</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Only the expert teaching this workflow can manage its people.
              </p>
            </div>
          </div>
        )
      }
    </AuthenticatedApp>
  );
}

function PeopleView({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [state, setState] = useState<PeopleState>({ status: "loading" });
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const applyPeopleResult = useCallback(
    (result: PeopleRequestResult) => {
      if (result.status === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      setState(result);
    },
    [router],
  );

  const refreshPeople = useCallback(async () => {
    const result = await requestPeople(workflowId);
    applyPeopleResult(result);
    return result.status === "ready";
  }, [applyPeopleResult, workflowId]);

  useEffect(() => {
    const controller = new AbortController();
    void requestPeople(workflowId, controller.signal).then(applyPeopleResult, (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({
        status: "error",
        message: "Tiro couldn’t connect. Check your connection and try again.",
      });
    });
    return () => controller.abort();
  }, [applyPeopleResult, workflowId]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    setEmailError(null);
    setFormError(null);
    setNotice(null);
    setIsInviting(true);

    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/invitations`,
        {
          body: JSON.stringify({ email }),
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const apiError = parsePeopleError(payload);

      if (response.status === 401 && apiError?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setEmailError(apiError?.fields.email ?? null);
        setFormError(apiError?.fields.email ? null : (apiError?.message ?? "Tiro couldn’t add that person."));
        setIsInviting(false);
        return;
      }

      const status = parseInviteStatus(payload);
      if (!status) {
        setFormError("Tiro returned an unexpected response.");
        setIsInviting(false);
        return;
      }

      form.reset();
      await refreshPeople();
      setNotice(
        status === "added"
          ? "They already have an account and were added to this workflow."
          : "Invitation saved. Tell them to sign up with this email—Tiro does not send an email.",
      );
    } catch {
      setFormError("Tiro couldn’t connect. Check your connection and try again.");
    } finally {
      setIsInviting(false);
    }
  }

  async function withdraw(invitationId: string) {
    setFormError(null);
    setNotice(null);
    setWithdrawingId(invitationId);

    try {
      const response = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/invitations/${encodeURIComponent(invitationId)}`,
        { credentials: "same-origin", method: "DELETE" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const apiError = parsePeopleError(payload);

      if (response.status === 401 && apiError?.code === "signed_out") {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setFormError(apiError?.message ?? "Tiro couldn’t withdraw that invitation.");
        return;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              data: {
                ...current.data,
                invitations: current.data.invitations.filter(
                  (invitation) => invitation.id !== invitationId,
                ),
              },
            }
          : current,
      );
      setNotice("Invitation withdrawn.");
    } catch {
      setFormError("Tiro couldn’t connect. Check your connection and try again.");
    } finally {
      setWithdrawingId(null);
    }
  }

  return (
    <div className="tiro-enter mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 md:px-10 md:py-10 lg:px-12">
      <header className="border-b border-stone-200 pb-9">
        <p className="text-sm font-semibold text-teal-800">Workflow access</p>
        <h1 className="mt-2 text-4xl font-medium tracking-[-0.025em] sm:text-[2.75rem]">People</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
          Invite new hires to learn this workflow and see who already has access.
        </p>
      </header>

      <section className="grid gap-7 border-b border-stone-200 py-7 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(26rem,1.2fr)] lg:items-end" aria-labelledby="invite-heading">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-teal-50 text-teal-900"><Icon className="size-4" name="people" /></span>
            <h2 className="text-lg font-bold tracking-[-0.02em]" id="invite-heading">Invite a new hire</h2>
          </div>
          <p className="mt-3 text-xs leading-5 text-red-700">
            Tiro does not send an email. Tell the person yourself which email address to use when they sign up.
          </p>
        </div>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" noValidate onSubmit={(event) => void invite(event)}>
          <div>
            <label className="sr-only" htmlFor="invite-email">Email address</label>
            <input
              aria-describedby={emailError ? "invite-email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              className={`h-11 w-full rounded-md border bg-white px-3 text-base outline-none focus:ring-2 sm:text-sm ${
                emailError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-stone-300 focus:border-blue-700 focus:ring-blue-100"
              }`}
              id="invite-email"
              name="email"
              placeholder="new.hire@example.com"
              type="email"
            />
            {emailError ? <p className="mt-1.5 text-xs font-medium text-red-700" id="invite-email-error">{emailError}</p> : null}
          </div>
          <button className="h-11 rounded-md bg-teal-900 px-5 text-xs font-bold text-white outline-none hover:bg-teal-800 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2" disabled={isInviting || state.status !== "ready"} type="submit">
            {isInviting ? "Adding person…" : "Add person"}
          </button>
        </form>
        {formError ? <p className="text-sm leading-6 text-red-700 lg:col-start-2" role="alert">{formError}</p> : null}
        {notice ? <p className="text-sm leading-6 text-teal-800 lg:col-start-2" aria-live="polite">{notice}</p> : null}
      </section>

      <section className="min-w-0 py-9">
        {state.status === "loading" ? (
          <p className="text-sm text-stone-600" aria-live="polite">Loading people…</p>
        ) : state.status === "error" ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5">
            <h2 className="font-semibold text-red-950">People didn’t load</h2>
            <p className="mt-2 text-sm leading-6 text-red-800">{state.message}</p>
            <button className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-800 outline-none hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-700" onClick={() => { setState({ status: "loading" }); void refreshPeople(); }} type="button">Try again</button>
          </div>
        ) : (
          <div className="space-y-10"><PeopleList data={state.data} onWithdraw={withdraw} withdrawingId={withdrawingId} /></div>
        )}
      </section>
    </div>
  );
}

async function requestPeople(
  workflowId: string,
  signal?: AbortSignal,
): Promise<PeopleRequestResult> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/people`, {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const apiError = parsePeopleError(payload);

  if (response.status === 401 && apiError?.code === "signed_out") {
    return { status: "signed_out" };
  }
  if (!response.ok) {
    return {
      status: "error",
      message: apiError?.message ?? "Tiro couldn’t load the people on this workflow.",
    };
  }

  const data = parsePeopleData(payload);
  return data
    ? { status: "ready", data }
    : { status: "error", message: "Tiro received an unexpected response." };
}

function PeopleList({
  data,
  onWithdraw,
  withdrawingId,
}: {
  data: PeopleData;
  onWithdraw: (invitationId: string) => Promise<void>;
  withdrawingId: string | null;
}) {
  return (
    <>
      <section aria-labelledby="members-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="members-heading">
              Members
            </h2>
            <p className="mt-2 text-sm text-stone-600">People with access now.</p>
          </div>
          <span className="text-sm tabular-nums text-stone-500">{data.members.length}</span>
        </div>
        <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
          {data.members.map((member) => (
            <li className="flex items-center gap-3 py-4" key={member.user_id}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-100 text-sm font-bold text-stone-700">
                {initials(member.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-stone-900">
                  {member.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-stone-500">
                  {member.email}
                </span>
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                {member.role === "expert" ? "Expert" : "New hire"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="invitations-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]" id="invitations-heading">
              Pending invitations
            </h2>
            <p className="mt-2 text-sm text-stone-600">Waiting for the person to sign up.</p>
          </div>
          <span className="text-sm tabular-nums text-stone-500">{data.invitations.length}</span>
        </div>
        {data.invitations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-6 text-sm leading-6 text-stone-600">
            No invitations are waiting.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {data.invitations.map((invitation) => (
              <li className="flex items-center gap-3 py-4" key={invitation.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-stone-900">
                    {invitation.email}
                  </span>
                  <span className="mt-1 block text-xs text-stone-500">
                    Invited {formatDate(invitation.created_at)}
                  </span>
                </span>
                <button
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 outline-none hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-red-700"
                  disabled={withdrawingId === invitation.id}
                  onClick={() => void onWithdraw(invitation.id)}
                  type="button"
                >
                  {withdrawingId === invitation.id ? "Withdrawing…" : "Withdraw"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}
