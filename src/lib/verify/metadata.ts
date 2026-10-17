// Free, in-Worker provenance scan. Looks for the marks generators and AI editors leave behind:
// C2PA manifests, IPTC DigitalSourceType values, EXIF/XMP software strings and the text chunks
// that Stable Diffusion front-ends write into PNGs. Stripped metadata defeats this layer, which is
// why the pixel classifier runs afterwards.

export type SignalLevel = "definitive" | "review" | "info";
export type Signal = { source: "metadata"; level: SignalLevel; label: string; evidence?: string };
export type MetadataReport = {
  format: "jpeg" | "png" | "webp" | "heic" | "gif" | "unknown";
  hasC2pa: boolean;
  camera: { make?: string; model?: string; software?: string };
  signals: Signal[];
};

export function sniffFormat(bytes: Uint8Array): MetadataReport["format"] {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  if (ascii(4, 4) === "ftyp" && /hei[cx]|mif1|msf1|avif/.test(ascii(8, 4))) return "heic";
  if (ascii(0, 3) === "GIF") return "gif";
  return "unknown";
}

/** Metadata lives near the start (JPEG APP segments, PNG chunks before IDAT) and sometimes at the end. */
function searchableText(bytes: Uint8Array): string {
  const head = bytes.subarray(0, Math.min(bytes.length, 768 * 1024));
  const tail = bytes.length > 1024 * 1024 ? bytes.subarray(bytes.length - 256 * 1024) : new Uint8Array();
  const decode = (b: Uint8Array) => {
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return s;
  };
  return decode(head) + "\n" + decode(tail);
}

const DEFINITIVE: [RegExp, string][] = [
  [/compositeWithTrainedAlgorithmicMedia/, "IPTC source type: composite with AI-generated media"],
  [/trainedAlgorithmicMedia/, "IPTC source type: AI-generated (trained algorithmic media)"],
  [/compositeSynthetic/, "IPTC source type: synthetic composite"],
  [/digitalsourcetype\/algorithmicMedia/i, "IPTC source type: algorithmic media"],
  [/Steps: \d+, Sampler: /, "Stable Diffusion generation parameters"],
  [/"class_type"\s*:\s*"(KSampler|CheckpointLoader)/, "ComfyUI workflow embedded"],
  [/invokeai_metadata|sd-metadata/i, "InvokeAI metadata"],
  [/NovelAI/, "Generator: NovelAI"],
  [/Midjourney/i, "Generator: Midjourney"],
  [/DALL[·\-.]?E/i, "Generator: DALL·E"],
  [/Adobe Firefly|Generative Fill|Generative Expand/i, "Adobe generative AI"],
  [/Made with Google AI|Google Imagen|Imagen \d|Nano Banana/i, "Generator: Google AI"],
  [/Magic Editor/i, "Google Photos Magic Editor"],
  [/Image Playground/i, "Apple Image Playground"],
  [/Edited with Clean Up/i, "Apple Clean Up (AI edit)"],
  [/Generative edit|Galaxy AI/i, "Samsung Galaxy AI edit"],
  [/Stable ?Diffusion|stability\.ai/i, "Generator: Stable Diffusion"],
  [/black-forest-labs|FLUX\.1/i, "Generator: FLUX"],
  [/ideogram/i, "Generator: Ideogram"],
  [/Leonardo\.Ai/i, "Generator: Leonardo"],
  [/Bing Image Creator|Microsoft Designer/i, "Generator: Microsoft Designer"],
  [/Imagine with Meta|Meta AI/i, "Generator: Meta AI"],
];

const REVIEW: [RegExp, string][] = [
  [/algorithmicallyEnhanced/, "IPTC source type: algorithmically enhanced"],
  [/OpenAI|ChatGPT|gpt-image/i, "Mentions OpenAI in metadata"],
  [/Gemini/i, "Mentions Gemini in metadata"],
  [/Remini|Topaz (Photo|Gigapixel)|Upscayl|Real-ESRGAN/i, "AI upscaler or enhancer"],
];

function readTag(text: string, tag: string): string | undefined {
  const m =
    text.match(new RegExp(`<(?:tiff|xmp|exif):${tag}>([^<]{1,80})<`, "i")) ??
    text.match(new RegExp(`(?:tiff|xmp|exif):${tag}="([^"]{1,80})"`, "i"));
  return m?.[1]?.trim();
}

async function readExif(bytes: Uint8Array): Promise<MetadataReport["camera"]> {
  try {
    const exifr = (await import("exifr")).default;
    const tags = (await exifr.parse(bytes, { tiff: true, ifd0: {}, xmp: false, iptc: false, icc: false })) as
      | Record<string, unknown>
      | undefined;
    const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 80) : undefined);
    return { make: s(tags?.Make), model: s(tags?.Model), software: s(tags?.Software) };
  } catch {
    return {};
  }
}

export async function scanMetadata(input: ArrayBuffer | Uint8Array): Promise<MetadataReport> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const format = sniffFormat(bytes);
  const text = searchableText(bytes);
  const signals: Signal[] = [];
  const seen = new Set<string>();

  for (const [re, label] of DEFINITIVE) {
    const m = text.match(re);
    if (m && !seen.has(label)) {
      seen.add(label);
      signals.push({ source: "metadata", level: "definitive", label, evidence: m[0].slice(0, 80) });
    }
  }
  for (const [re, label] of REVIEW) {
    const m = text.match(re);
    if (m && !seen.has(label)) {
      seen.add(label);
      signals.push({ source: "metadata", level: "review", label, evidence: m[0].slice(0, 80) });
    }
  }

  const hasC2pa = /jumb|c2pa/i.test(text) && /c2pa\./.test(text);
  if (hasC2pa) signals.push({ source: "metadata", level: "info", label: "Content Credentials (C2PA) manifest present" });

  const camera = await readExif(bytes);
  camera.make ??= readTag(text, "Make");
  camera.model ??= readTag(text, "Model");
  camera.software ??= readTag(text, "Software") ?? readTag(text, "CreatorTool");
  if (camera.make || camera.model) {
    signals.push({ source: "metadata", level: "info", label: `Camera: ${[camera.make, camera.model].filter(Boolean).join(" ")}` });
  }
  if (camera.software) signals.push({ source: "metadata", level: "info", label: `Software: ${camera.software}` });

  return { format, hasC2pa, camera, signals };
}
