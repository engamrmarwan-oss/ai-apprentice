"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import {
  buildWorkflowInput,
  getCreatedWorkflowId,
  parseWorkflowError,
  type WorkflowField,
  type WorkflowFormErrors,
} from "./new-workflow-data";

const emptyErrors: WorkflowFormErrors = { fieldErrors: {}, formError: null };

export function NewWorkflowForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<WorkflowFormErrors>(emptyErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors(emptyErrors);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/workflows", {
        body: JSON.stringify(buildWorkflowInput(new FormData(event.currentTarget))),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (response.status === 401 && isApiCode(payload, "signed_out")) {
        router.replace("/sign-in");
        return;
      }
      if (!response.ok) {
        setErrors(parseWorkflowError(payload));
        setIsSubmitting(false);
        return;
      }

      const workflowId = getCreatedWorkflowId(payload);
      if (!workflowId) {
        setErrors({
          fieldErrors: {},
          formError: "Tiro created the workflow but returned an unexpected response.",
        });
        setIsSubmitting(false);
        return;
      }

      router.replace(`/workflows/${encodeURIComponent(workflowId)}`);
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
    <form className="mt-8 space-y-6" noValidate onSubmit={(event) => void submit(event)}>
      <FormField
        autoComplete="off"
        error={errors.fieldErrors.tool_name}
        label="Tool name"
        name="tool_name"
        placeholder="Invoice desk"
        required
      />
      <FormField
        autoComplete="url"
        error={errors.fieldErrors.tool_url}
        help="Optional. Use the address you open to do this work."
        label="Tool address"
        name="tool_url"
        placeholder="https://invoices.example.test"
        type="url"
      />
      <div>
        <label className="text-sm font-semibold text-stone-800" htmlFor="task">
          The task
        </label>
        <textarea
          aria-describedby={`task-help${errors.fieldErrors.task ? " task-error" : ""}`}
          aria-invalid={Boolean(errors.fieldErrors.task)}
          className={`mt-2 min-h-28 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-base leading-6 text-stone-950 outline-none transition placeholder:text-stone-400 focus:ring-2 sm:text-sm ${
            errors.fieldErrors.task
              ? "border-red-400 focus:border-red-500 focus:ring-red-100"
              : "border-stone-300 hover:border-stone-400 focus:border-teal-700 focus:ring-teal-100"
          }`}
          id="task"
          name="task"
          placeholder="Review incoming invoices and decide what should be approved"
          required
        />
        <p className="mt-1.5 text-xs leading-5 text-stone-500" id="task-help">
          Describe one repeatable piece of work Tiro should learn.
        </p>
        {errors.fieldErrors.task ? (
          <p className="mt-1.5 text-xs font-medium leading-5 text-red-700" id="task-error">
            {errors.fieldErrors.task}
          </p>
        ) : null}
      </div>
      <FormField
        autoComplete="organization-title"
        error={errors.fieldErrors.role}
        help="Optional. This gives Tiro context for your decisions."
        label="Your job title"
        name="role"
        placeholder="Accounts payable specialist"
      />

      {errors.formError ? (
        <div
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {errors.formError}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:justify-end">
        <button
          className="h-11 rounded-lg px-4 text-sm font-semibold text-stone-700 outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-teal-700"
          onClick={() => router.push("/")}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-11 rounded-lg bg-teal-900 px-5 text-sm font-semibold text-white outline-none hover:bg-teal-950 disabled:cursor-wait disabled:bg-stone-400 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating workflow…" : "Create workflow"}
        </button>
      </div>
    </form>
  );
}

function FormField({
  error,
  help,
  label,
  name,
  ...props
}: {
  error?: string;
  help?: string;
  label: string;
  name: Exclude<WorkflowField, "task">;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id" | "name">) {
  const helpId = `${name}-help`;
  const errorId = `${name}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label className="text-sm font-semibold text-stone-800" htmlFor={name}>
        {label}
      </label>
      <input
        {...props}
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

function isApiCode(value: unknown, code: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "code" in value.error &&
    value.error.code === code
  );
}
