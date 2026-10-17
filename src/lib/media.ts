/** Public URL for an object in the MEDIA bucket, served by src/app/media/[...key]/route.ts. */
export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/media/${key}` : null;
}
