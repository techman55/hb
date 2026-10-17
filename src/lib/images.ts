// Image work on the Cloudflare Images binding. Every derivative is re-encoded, which strips
// EXIF/XMP (including GPS) from anything we serve publicly. Originals stay private in UPLOADS.

import { isDev, type Env } from "@/lib/env";

export const DISPLAY_WIDTH = 1600;
export const THUMB_WIDTH = 480;
export const ANALYSIS_WIDTH = 1024;

function images(env: Env): ImagesBinding {
  if (!env.IMAGES) throw new Error("IMAGES binding unavailable");
  return env.IMAGES;
}

async function originalStream(env: Env, key: string) {
  const obj = await env.UPLOADS.get(key);
  if (!obj) throw new Error(`missing upload ${key}`);
  return obj.body;
}

export async function imageInfo(env: Env, key: string) {
  try {
    return await images(env).info(await originalStream(env, key));
  } catch {
    return null;
  }
}

/** Resize + re-encode an original into MEDIA. Falls back to a raw copy only in local dev. */
export async function writeDerivative(env: Env, srcKey: string, destKey: string, width: number) {
  try {
    const result = await images(env).input(await originalStream(env, srcKey))
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 82 });
    await env.MEDIA.put(destKey, result.image(), {
      httpMetadata: { contentType: result.contentType(), cacheControl: "public, max-age=31536000, immutable" },
    });
    return destKey;
  } catch (err) {
    if (!isDev(env)) throw err;
    // Local Images emulation can be missing; copying keeps the dev loop working.
    const obj = await env.UPLOADS.get(srcKey);
    if (!obj) throw err;
    await env.MEDIA.put(destKey, obj.body, { httpMetadata: obj.httpMetadata });
    return destKey;
  }
}

/** A JPEG copy sized for detectors and the vision model. */
export async function analysisJpeg(env: Env, key: string, width = ANALYSIS_WIDTH): Promise<Blob> {
  try {
    const result = await images(env).input(await originalStream(env, key))
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/jpeg", quality: 85 });
    return new Blob([await new Response(result.image()).arrayBuffer()], { type: "image/jpeg" });
  } catch (err) {
    const obj = await env.UPLOADS.get(key);
    if (!obj) throw err;
    const type = obj.httpMetadata?.contentType ?? "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) throw err;
    return new Blob([await obj.arrayBuffer()], { type });
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(bin)}`;
}
