import { describe, expect, it } from "vitest";
import { parseAuthErrors, parseResendSent, parseSignUpResult } from "./auth-errors";

describe("parseAuthErrors", () => {
  it("puts documented field errors beside their fields", () => {
    expect(
      parseAuthErrors({
        ok: false,
        error: {
          code: "invalid_input",
          message: "Some fields need correcting.",
          fields: {
            email: "Enter a valid email address.",
            password: "Use at least 8 characters.",
          },
        },
      }),
    ).toEqual({
      code: "invalid_input",
      fieldErrors: {
        email: "Enter a valid email address.",
        password: "Use at least 8 characters.",
      },
      formError: null,
    });
  });

  it.each(["invalid_credentials", "email_not_confirmed", "email_taken", "unavailable"])(
    "shows %s as a form error when there are no field errors",
    (code) => {
      expect(
        parseAuthErrors({
          ok: false,
          error: { code, message: `Message for ${code}.` },
        }),
      ).toEqual({
        code,
        fieldErrors: {},
        formError: `Message for ${code}.`,
      });
    },
  );

  it("falls back safely for a malformed response", () => {
    expect(parseAuthErrors(null)).toEqual({
      code: null,
      fieldErrors: {},
      formError: "Tiro couldn’t finish that just now. Try again.",
    });
  });
});

describe("parseSignUpResult", () => {
  it("carries on when the account is signed in", () => {
    expect(parseSignUpResult({ ok: true, user: { id: "u", email: "a@b.c", name: "A" } })).toEqual({
      status: "signed_in",
    });
  });

  it("asks to confirm the address when confirmation is on", () => {
    expect(parseSignUpResult({ ok: true, confirm: { email: "a@b.c" } })).toEqual({
      status: "confirm",
      email: "a@b.c",
    });
  });

  it("rejects an answer with neither", () => {
    expect(parseSignUpResult({ ok: true })).toBeNull();
  });
});

describe("parseResendSent", () => {
  it("reads the documented answer", () => {
    expect(parseResendSent({ ok: true, sent: true })).toBe(true);
    expect(parseResendSent({ ok: false })).toBe(false);
  });
});
