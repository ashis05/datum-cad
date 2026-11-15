// Download helpers for the STEP/STL export files.

/** Trigger a browser download for an in-memory Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Filename-safe slug of a prompt: lowercase a–z0–9 and hyphens, max 40 chars
 * (cut at a word boundary when possible), falling back to "part".
 */
export function slugify(text: string, maxLength = 40): string {
  const full = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let slug = full.slice(0, maxLength);
  if (full.length > maxLength && full[maxLength] !== "-" && slug.includes("-")) {
    slug = slug.slice(0, slug.lastIndexOf("-"));
  }
  slug = slug.replace(/-+$/g, "");
  return slug || "part";
}
