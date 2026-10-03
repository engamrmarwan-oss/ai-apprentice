// A minimal zip writer for the spike recorder. Files are stored, not compressed:
// PNG frames are already compressed, and storing keeps this small and fast.

export type ZipEntry = { name: string; bytes: Uint8Array<ArrayBuffer> };

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const UTF8_NAMES = 0x0800;
const VERSION = 20;

/** The parts of a zip file, in order. Pass them to `new Blob(parts)`. */
export function zipStore(entries: ZipEntry[]): Uint8Array<ArrayBuffer>[] {
  const encoder = new TextEncoder();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, VERSION, true);
    lv.setUint16(6, UTF8_NAMES, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x21, true); // date: 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const header = new Uint8Array(46 + name.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x02014b50, true);
    hv.setUint16(4, VERSION, true);
    hv.setUint16(6, VERSION, true);
    hv.setUint16(8, UTF8_NAMES, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0, true);
    hv.setUint16(14, 0x21, true);
    hv.setUint32(16, crc, true);
    hv.setUint32(20, size, true);
    hv.setUint32(24, size, true);
    hv.setUint16(28, name.length, true);
    hv.setUint32(42, offset, true);
    header.set(name, 46);

    parts.push(local, entry.bytes);
    central.push(header);
    offset += local.length + size;
  }

  const centralSize = central.reduce((total, header) => total + header.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return [...parts, ...central, end];
}
