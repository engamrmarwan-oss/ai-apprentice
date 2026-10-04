import { describe, expect, it } from "vitest";
import { frameReading } from "./types";

describe("frameReading", () => {
  it("reads the screen moment stored on a typed frame", () => {
    expect(
      frameReading({
        changed_region: null,
        created_at: "2026-10-04T09:00:00Z",
        height: 720,
        id: "frame-1",
        is_key: true,
        reading: {
          screen: "Invoice detail",
          item: "Invoice 2 of 3",
          fields: [{ name: "Supplier", value: "Northstar Office Supply" }],
        },
        redacted: false,
        session_id: "session-1",
        storage_path: "frames/session-1/frame-1.webp",
        t_ms: 42000,
        width: 1280,
      }),
    ).toEqual({
      screen: "Invoice detail",
      item: "Invoice 2 of 3",
      fields: [{ name: "Supplier", value: "Northstar Office Supply" }],
    });
  });

  it("rejects a malformed reading", () => {
    expect(
      frameReading({
        changed_region: null,
        created_at: "2026-10-04T09:00:00Z",
        height: null,
        id: "frame-1",
        is_key: true,
        reading: { screen: 42 },
        redacted: false,
        session_id: "session-1",
        storage_path: "frame.webp",
        t_ms: 0,
        width: null,
      }),
    ).toBeNull();
  });
});
