export type AuthField = "email" | "invite_code" | "name" | "password";

export type AuthErrors = {
  fieldErrors: Partial<Record<AuthField, string>>;
  formError: string | null;
};

const authFields = new Set<AuthField>([
  "email",
  "invite_code",
  "name",
  "password",
]);

export function parseAuthErrors(value: unknown): AuthErrors {
  const fallback = "Tiro couldn’t finish that just now. Try again.";

  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return { fieldErrors: {}, formError: fallback };
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
    fieldErrors,
    formError: Object.keys(fieldErrors).length > 0 ? null : message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
