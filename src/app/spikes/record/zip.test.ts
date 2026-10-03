import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip";

const text = (value: string) => new TextEncoder().encode(value);

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zipStore", () => {
  const files = [
    { name: "frames/0001.png", bytes: text("first") },
    { name: "manifest.json", bytes: text('{"frames":1}') },
  ];
  const zip = join(zipStore(files));
  const view = new DataView(zip.buffer);
  const end = zip.length - 22;

  it("ends with a directory that counts every file", () => {
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
  });

  it("points the directory at each file's stored bytes", () => {
    let header = view.getUint32(end + 16, true);
    for (const file of files) {
      expect(view.getUint32(header, true)).toBe(0x02014b50);
      const nameLength = view.getUint16(header + 28, true);
      const local = view.getUint32(header + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      expect(view.getUint32(local + 14, true)).toBe(crc32(file.bytes));

      const dataStart = local + 30 + view.getUint16(local + 26, true);
      const size = view.getUint32(local + 18, true);
      expect(new TextDecoder().decode(zip.slice(dataStart, dataStart + size))).toBe(
        new TextDecoder().decode(file.bytes),
      );
      expect(new TextDecoder().decode(zip.slice(header + 46, header + 46 + nameLength))).toBe(file.name);
      header += 46 + nameLength;
    }
  });
});
