export type AuthField = "email" | "name" | "password";

export type AuthErrors = {
  code: string | null;
  fieldErrors: Partial<Record<AuthField, string>>;
  formError: string | null;
};

const authFields = new Set<AuthField>(["email", "name", "password"]);

export function parseAuthErrors(value: unknown): AuthErrors {
  const fallback = "Tiro couldn’t finish that just now. Try again.";

  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return { code: null, fieldErrors: {}, formError: fallback };
  }

  const message =
    typeof value.error.message === "string" && value.error.message.trim()
      ? value.error.message
      : fallback;
  const fieldErrors: Partial<Record<AuthField, string>> = {};

  if (isRecord(value.error.fields)) {
    for (const [field, fieldMessage] of Object.entries(value.error.fields)) {
      if (authFields.has(field as AuthField) && typeof fieldMessage === "string") {
        fieldErrors[field as AuthField] = fieldMessage;
      }
    }
  }

  return {
    code: typeof value.error.code === "string" ? value.error.code : null,
    fieldErrors,
    formError: Object.keys(fieldErrors).length > 0 ? null : message,
  };
}

export type SignUpResult = { status: "signed_in" } | { status: "confirm"; email: string };

/** A sign-up either signs the person in, or, with email confirmation on, asks them to confirm first. */
export function parseSignUpResult(value: unknown): SignUpResult | null {
  if (!isRecord(value) || value.ok !== true) return null;
  if (isRecord(value.confirm) && typeof value.confirm.email === "string") {
    return { status: "confirm", email: value.confirm.email };
  }
  return isRecord(value.user) ? { status: "signed_in" } : null;
}

export function parseResendSent(value: unknown) {
  return isRecord(value) && value.ok === true && value.sent === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
