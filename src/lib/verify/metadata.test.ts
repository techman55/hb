import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { scanMetadata, sniffFormat } from "./metadata";

// Minimal valid PNG builder so fixtures live in code instead of binary files.
function crc32(buf: Buffer) {
  let c: number;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(textChunks: Record<string, string> = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((2 * 3 + 1) * 2);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      ...Object.entries(textChunks).map(([k, v]) => chunk("tEXt", Buffer.from(`${k}\0${v}`, "latin1"))),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function jpegWithXmp(xmp: string) {
  const payload = Buffer.from(`http://ns.adobe.com/xap/1.0/\0${xmp}`, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, payload, Buffer.from([0xff, 0xd9])]));
}

describe("sniffFormat", () => {
  it("recognises PNG and JPEG by magic bytes", () => {
    expect(sniffFormat(png())).toBe("png");
    expect(sniffFormat(jpegWithXmp("<x/>"))).toBe("jpeg");
    expect(sniffFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe("unknown");
  });
});

describe("scanMetadata", () => {
  it("passes a plain photo with no generator marks", async () => {
    const report = await scanMetadata(png());
    expect(report.signals.filter((s) => s.level !== "info")).toEqual([]);
  });

  it("flags Stable Diffusion parameters in a PNG text chunk", async () => {
    const report = await scanMetadata(
      png({ parameters: "a calculator on a desk\nNegative prompt: blurry\nSteps: 30, Sampler: DPM++ 2M, CFG scale: 7, Seed: 1" }),
    );
    expect(report.signals.some((s) => s.level === "definitive" && s.label.includes("Stable Diffusion"))).toBe(true);
  });

  it("flags the IPTC trainedAlgorithmicMedia source type in XMP", async () => {
    const xmp = `<x:xmpmeta><rdf:Description Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"/></x:xmpmeta>`;
    const report = await scanMetadata(jpegWithXmp(xmp));
    expect(report.signals.some((s) => s.level === "definitive" && s.label.includes("AI-generated"))).toBe(true);
  });

  it("flags AI edits like Google Magic Editor", async () => {
    const report = await scanMetadata(jpegWithXmp(`<x:xmpmeta><xmp:CreatorTool>Google Photos Magic Editor</xmp:CreatorTool></x:xmpmeta>`));
    expect(report.signals.some((s) => s.level === "definitive" && s.label.includes("Magic Editor"))).toBe(true);
  });

  it("sends AI upscalers to review rather than auto-flagging as generated", async () => {
    const report = await scanMetadata(jpegWithXmp(`<x:xmpmeta><xmp:CreatorTool>Remini</xmp:CreatorTool></x:xmpmeta>`));
    expect(report.signals.some((s) => s.level === "review")).toBe(true);
    expect(report.signals.some((s) => s.level === "definitive")).toBe(false);
  });
});
