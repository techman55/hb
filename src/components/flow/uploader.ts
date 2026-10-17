// Browser side of the R2 multipart upload. Photos are sent byte-for-byte (no client re-encode)
// so the server-side provenance checks can read the original metadata.

export type UploadResult = { id: string; displayUrl: string | null; thumbUrl: string | null };

const EXT_TYPES: Record<string, string> = { heic: "image/heic", heif: "image/heif", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export function photoContentType(file: Blob & { name?: string }): string | null {
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return file.type;
  const ext = file.name?.split(".").pop()?.toLowerCase();
  return ext ? (EXT_TYPES[ext] ?? null) : null;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Upload failed");
  return data;
}

function putPart(url: string, body: Blob, onProgress: (loaded: number) => void): Promise<{ partNumber: number; etag: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error ?? "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(body);
  });
}

export async function uploadPhoto(opts: {
  listingId: string;
  file: Blob & { name?: string };
  source: "camera" | "upload";
  onProgress?: (fraction: number) => void;
}): Promise<UploadResult> {
  const contentType = photoContentType(opts.file);
  if (!contentType) throw new Error("Use a JPEG, PNG, WebP or HEIC photo.");
  const start = await postJSON<{ photoId: string; partSize: number; parts: number }>("/api/uploads", {
    listingId: opts.listingId,
    contentType,
    size: opts.file.size,
    source: opts.source,
  });

  const loaded = new Array<number>(start.parts).fill(0);
  const report = () => opts.onProgress?.(Math.min(0.97, loaded.reduce((a, b) => a + b, 0) / opts.file.size));
  const results: { partNumber: number; etag: string }[] = [];
  const queue = Array.from({ length: start.parts }, (_, i) => i + 1);

  const worker = async () => {
    while (queue.length) {
      const n = queue.shift()!;
      const chunk = opts.file.slice((n - 1) * start.partSize, n * start.partSize);
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          results.push(
            await putPart(`/api/uploads/${start.photoId}/parts/${n}`, chunk, (l) => {
              loaded[n - 1] = l;
              report();
            }),
          );
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      if (lastErr) throw lastErr;
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, start.parts) }, worker));

  const done = await postJSON<UploadResult>(`/api/uploads/${start.photoId}/complete`, { parts: results });
  opts.onProgress?.(1);
  return done;
}
