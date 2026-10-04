import { describe, expect, it } from "vitest";
import { parseAuthErrors } from "./auth-errors";

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
      fieldErrors: {
        email: "Enter a valid email address.",
        password: "Use at least 8 characters.",
      },
      formError: null,
    });
  });

  it.each(["invalid_credentials", "invite_required", "email_taken", "unavailable"])(
    "shows %s as a form error when there are no field errors",
    (code) => {
      expect(
        parseAuthErrors({
          ok: false,
          error: { code, message: `Message for ${code}.` },
        }),
      ).toEqual({
        fieldErrors: {},
        formError: `Message for ${code}.`,
      });
    },
  );

  it("falls back safely for a malformed response", () => {
    expect(parseAuthErrors(null)).toEqual({
      fieldErrors: {},
      formError: "Tiro couldn’t finish that just now. Try again.",
    });
  });
});
