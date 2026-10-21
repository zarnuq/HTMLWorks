/** Resolve an HTML image against a vault file, without treating web or data URLs as vault files. */
export function vaultImagePath(filePath: string, source: string, authorBase?: string | null): string | undefined {
  try {
    const origin = "https://html-works.invalid";
    const fileUrl = new URL(filePath.split("/").map(encodeURIComponent).join("/"), `${origin}/`);
    const base = authorBase ? new URL(authorBase, fileUrl) : fileUrl;
    const image = new URL(source, base);
    if (image.origin !== origin || !source || source.startsWith("#")) return undefined;
    return decodeURIComponent(image.pathname.slice(1));
  } catch { return undefined; }
}

/** MIME types of local files a sandboxed preview can receive as data URLs. */
export function resourceMime(extension: string): string | undefined {
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", gif: "image/gif", webp: "image/webp", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon",
    css: "text/css", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" } as Record<string, string>)[extension.toLowerCase()];
}

/** Doc Works naming: remote images, numbered by first use, can be read from "<name> attachments/image-N.<ext>". */
export function attachmentNames(sources: string[]): Map<string, string> {
  const remote = Array.from(new Set(sources.filter(src => /^(https?:)?\/\//i.test(src.trim()))));
  return new Map(remote.map((src, i) => [src, `image-${i + 1}`]));
}
