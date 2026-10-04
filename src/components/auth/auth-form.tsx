"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { parseAuthErrors, type AuthErrors, type AuthField } from "./auth-errors";

type FormKind = "sign-in" | "sign-up";

const emptyErrors: AuthErrors = { fieldErrors: {}, formError: null };

export function AuthForm({ kind }: { kind: FormKind }) {
  const router = useRouter();
  const [errors, setErrors] = useState<AuthErrors>(emptyErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      body.invite_code = String(form.get("invite_code") ?? "");
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

      router.replace("/");
      router.refresh();
    } catch {
      setErrors({
        fieldErrors: {},
        formError: "Tiro couldn’t connect. Check your connection and try again.",
      });
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-5" noValidate onSubmit={(event) => void submit(event)}>
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
        placeholder="you@example.com"
        required
        type="email"
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

      {isSignUp ? (
        <Field
          autoComplete="off"
          error={errors.fieldErrors.invite_code}
          help="Optional if an expert invited this email to a workflow."
          label="Invite code"
          name="invite_code"
          placeholder="Enter a code, if you have one"
        />
      ) : null}

      {errors.formError ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {errors.formError}
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
