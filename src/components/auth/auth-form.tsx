"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  parseAuthErrors,
  parseResendSent,
  parseSignUpResult,
  type AuthErrors,
  type AuthField,
} from "./auth-errors";

type FormKind = "sign-in" | "sign-up";

const emptyErrors: AuthErrors = { code: null, fieldErrors: {}, formError: null };
const CONNECTION_ERROR = "Tiro couldn’t connect. Check your connection and try again.";

/** What the sign-in page says when the confirmation link brought the person back, by `?confirmation=`. */
const CONFIRMATION_NOTICES: Record<string, string> = {
  failed: "That confirmation link has expired or was already used. Sign in, or send yourself a new link.",
  unavailable:
    "Tiro couldn’t confirm your address just now. Try the link again in a moment, or send yourself a new one.",
};

export function AuthForm({
  confirmation,
  kind,
}: {
  confirmation?: string;
  kind: FormKind;
}) {
  const confirmationNotice = confirmation ? CONFIRMATION_NOTICES[confirmation] : undefined;
  const router = useRouter();
  const [errors, setErrors] = useState<AuthErrors>(emptyErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const isSignUp = kind === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(emptyErrors);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    if (isSignUp) {
      body.name = String(form.get("name") ?? "");
    }

    try {
      const response = await fetch(`/api/auth/${kind}`, {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setErrors(parseAuthErrors(payload));
        setIsSubmitting(false);
        return;
      }

      if (isSignUp) {
        const result = parseSignUpResult(payload);
        if (!result) {
          setErrors({ ...emptyErrors, formError: "Tiro returned an unexpected response." });
          setIsSubmitting(false);
          return;
        }
        if (result.status === "confirm") {
          setConfirmEmail(result.email);
          setIsSubmitting(false);
          return;
        }
      }

      router.replace("/");
      router.refresh();
    } catch {
      setErrors({ ...emptyErrors, formError: CONNECTION_ERROR });
      setIsSubmitting(false);
    }
  }

  if (confirmEmail) return <CheckEmail email={confirmEmail} />;

  return (
    <form className="space-y-5" noValidate onSubmit={(event) => void submit(event)}>
      {confirmationNotice && !errors.formError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="status">
          <p>{confirmationNotice}</p>
          <ResendButton email={email} label="Send me a new link" />
        </div>
      ) : null}

      {isSignUp ? (
        <Field
          autoComplete="name"
          error={errors.fieldErrors.name}
          label="Name"
          name="name"
          placeholder="Ada Lovelace"
          required
        />
      ) : null}

      <Field
        autoComplete="email"
        error={errors.fieldErrors.email}
        label="Email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        type="email"
        value={email}
      />

      <Field
        autoComplete={isSignUp ? "new-password" : "current-password"}
        error={errors.fieldErrors.password}
        help={isSignUp ? "Use 8 characters or more." : undefined}
        label="Password"
        minLength={isSignUp ? 8 : undefined}
        name="password"
        required
        type="password"
      />

      {errors.formError ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {errors.formError}
          {errors.code === "email_not_confirmed" ? (
            <ResendButton email={email} label="Send the confirmation email again" tone="red" />
          ) : null}
        </div>
      ) : null}

      <button
        className="flex h-12 w-full items-center justify-center rounded-xl bg-teal-950 px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-teal-900 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting
          ? isSignUp
            ? "Creating your account…"
            : "Signing in…"
          : isSignUp
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}

function CheckEmail({ email }: { email: string }) {
  return (
    <div className="space-y-4" role="status">
      <h2 className="text-xl font-semibold tracking-[-0.025em] text-stone-950">Check your email</h2>
      <p className="text-sm leading-6 text-stone-700">
        We sent a link to <span className="font-semibold break-all text-stone-950">{email}</span>. Follow the link in it to confirm your address and finish creating your account.
      </p>
      <p className="text-sm leading-6 text-stone-600">
        Nothing there? Look in your spam folder, or send it again.
      </p>
      <ResendButton email={email} label="Send it again" />
    </div>
  );
}

/** Asks for a new confirmation link for the address given. The answer is the same whether or not the account exists. */
function ResendButton({
  email,
  label,
  tone = "teal",
}: {
  email: string;
  label: string;
  tone?: "teal" | "red";
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function resend() {
    setProblem(null);
    const address = email.trim();
    if (!address) {
      setProblem("Type your email address in the Email box first.");
      return;
    }
    setState("sending");
    try {
      const response = await fetch("/api/auth/resend-confirmation", {
        body: JSON.stringify({ email: address }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !parseResendSent(payload)) {
        const errors = parseAuthErrors(payload);
        setProblem(errors.fieldErrors.email ?? errors.formError ?? "Tiro couldn’t send it just now. Try again.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setProblem(CONNECTION_ERROR);
      setState("idle");
    }
  }

  const button =
    tone === "red"
      ? "text-red-800 ring-red-200 hover:bg-red-100"
      : "text-teal-900 ring-teal-200 hover:bg-teal-50";

  return (
    <div className="mt-3">
      <button
        className={`h-10 rounded-lg bg-white px-3.5 text-sm font-semibold ring-1 outline-none disabled:cursor-wait disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-teal-700 ${button}`}
        disabled={state === "sending"}
        onClick={() => void resend()}
        type="button"
      >
        {state === "sending" ? "Sending…" : label}
      </button>
      <p aria-live="polite" className="mt-2 text-sm leading-6">
        {state === "sent" ? (
          <span className="text-teal-800">If an account is waiting for that address, a new link is on its way.</span>
        ) : problem ? (
          <span className="text-red-700">{problem}</span>
        ) : null}
      </p>
    </div>
  );
}

function Field({
  error,
  help,
  label,
  name,
  ...inputProps
}: {
  error?: string;
  help?: string;
  label: string;
  name: AuthField;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "name">) {
  const errorId = `${name}-error`;
  const helpId = `${name}-help`;
  const describedBy = [help ? helpId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label className="text-sm font-semibold text-stone-800" htmlFor={name}>
        {label}
      </label>
      <input
        {...inputProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={Boolean(error)}
        className={`mt-2 h-12 w-full rounded-xl border bg-white px-3.5 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:ring-2 sm:text-sm ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-stone-300 hover:border-stone-400 focus:border-teal-700 focus:ring-teal-100"
        }`}
        id={name}
        name={name}
      />
      {help ? (
        <p className="mt-1.5 text-xs leading-5 text-stone-500" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 text-xs font-medium leading-5 text-red-700" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
