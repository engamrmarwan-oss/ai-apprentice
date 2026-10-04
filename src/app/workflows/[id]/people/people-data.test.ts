import { describe, expect, it } from "vitest";
import { parseInviteStatus, parsePeopleData, parsePeopleError } from "./people-data";

describe("people data", () => {
  it("parses members and pending invitations", () => {
    expect(
      parsePeopleData({
        ok: true,
        members: [
          {
            user_id: "user-1",
            name: "Ada",
            email: "ada@example.com",
            role: "expert",
          },
        ],
        invitations: [
          {
            id: "invite-1",
            email: "new@example.com",
            role: "new_hire",
            created_at: "2026-10-04T09:00:00Z",
          },
        ],
      }),
    ).toEqual({
      members: [
        {
          user_id: "user-1",
          name: "Ada",
          email: "ada@example.com",
          role: "expert",
        },
      ],
      invitations: [
        {
          id: "invite-1",
          email: "new@example.com",
          role: "new_hire",
          created_at: "2026-10-04T09:00:00Z",
        },
      ],
    });
  });

  it("rejects malformed people responses", () => {
    expect(parsePeopleData({ ok: true, members: [], invitations: [{ id: 1 }] })).toBeNull();
  });

  it("parses route errors and invitation outcomes", () => {
    expect(
      parsePeopleError({
        ok: false,
        error: {
          code: "invalid_input",
          message: "Some fields need correcting.",
          fields: { email: "Enter a valid email address." },
        },
      }),
    ).toEqual({
      code: "invalid_input",
      fields: { email: "Enter a valid email address." },
      message: "Some fields need correcting.",
    });
    expect(parseInviteStatus({ ok: true, status: "added" })).toBe("added");
    expect(parseInviteStatus({ ok: true, status: "invited" })).toBe("invited");
    expect(parseInviteStatus({ ok: true, status: "other" })).toBeNull();
  });
});
