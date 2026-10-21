export type PageTheme = "light" | "dark";

export function sandboxFor(trusted: boolean): string {
  return trusted ? "allow-scripts" : "";
}

/** Build a disposable rendering copy. The source document is never serialized back to disk. */
export function buildPreview(source: string, resourceUrl: string, trusted: boolean, theme: PageTheme,
  imageOverrides: Record<string, string> = {}): string {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const folderUrl = new URL(".", resourceUrl).href;
  const authorBase = doc.querySelector("base[href]")?.getAttribute("href");
  let baseUrl = folderUrl;
  if (authorBase) {
    try { baseUrl = new URL(authorBase, folderUrl).href; } catch { /* Keep the source folder for invalid base URLs. */ }
  }
  doc.querySelectorAll("base").forEach(el => el.remove());
  doc.querySelectorAll("meta[http-equiv]").forEach(el => {
    if (el.getAttribute("http-equiv")?.toLowerCase() === "refresh") el.remove();
  });
  const base = createEl("base");
  base.href = baseUrl;
  const policy = createEl("meta");
  policy.httpEquiv = "Content-Security-Policy";
  // Previews never use the network: remote URLs stay unloaded and only vault files, inlined as data URLs, appear.
  const resources = "app: capacitor: data: blob:";
  policy.content = [
    "default-src 'none'", `img-src ${resources}`, `media-src ${resources}`, `font-src ${resources}`,
    `style-src 'unsafe-inline' ${resources}`,
    trusted ? `script-src 'unsafe-inline' 'unsafe-eval' ${resources}` : "script-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'", "object-src 'none'", "form-action 'none'",
  ].join("; ");
  // DNS prefetching is outside CSP; this switches it off for links the page or its scripts add.
  const prefetch = createEl("meta");
  prefetch.httpEquiv = "x-dns-prefetch-control";
  prefetch.content = "off";
  const colorScheme = createEl("meta");
  colorScheme.name = "color-scheme";
  colorScheme.content = theme;
  const defaults = createEl("style");
  const background = theme === "dark" ? "#1e1e2e" : "#ffffff";
  const foreground = theme === "dark" ? "#dcdef1" : "#222222";
  const link = theme === "dark" ? "#a6b8ff" : "#245cc5";
  defaults.textContent = `:root{color-scheme:${theme};background-color:${background};color:${foreground}} body{margin:0;padding:28px;font:16px/1.6 system-ui,sans-serif;overflow-wrap:break-word} a{color:${link}} img,video{max-width:100%;height:auto} pre{overflow:auto} table{max-width:100%}`;
  // Author styles come later in the cascade and retain control of their own layout.
  doc.head.prepend(policy, prefetch, base, colorScheme, defaults);
  if (trusted) {
    // Runs before any author script: CSP does not cover WebRTC. Navigation is blocked by the wrapper frame.
    const guard = createEl("script");
    guard.textContent = NETWORK_GUARD;
    defaults.after(guard);
  }
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const replacement = imageOverrides[img.getAttribute("src") ?? ""];
    if (replacement) {
      img.src = replacement;
      img.removeAttribute("srcset");
      if (img.parentElement?.tagName === "PICTURE") img.parentElement.querySelectorAll("source").forEach(el => el.remove());
    }
  }
  // Sandboxed frames cannot load app:// files, so local srcsets, stylesheets and CSS urls use the inlined copies too.
  doc.querySelectorAll("[srcset]").forEach(el => {
    const srcset = el.getAttribute("srcset") ?? "";
    if (srcsetUrls(srcset).some(url => imageOverrides[url])) el.setAttribute("srcset", srcset.split(",").map(candidate => {
      const [url, ...descriptors] = candidate.trim().split(/\s+/);
      return [imageOverrides[url] ?? url, ...descriptors].join(" ");
    }).join(", "));
  });
  doc.querySelectorAll("link[href]").forEach(el => {
    const css = imageOverrides[el.getAttribute("href") ?? ""]?.match(/^data:text\/css;charset=utf-8,(.*)$/s);
    if (!css || !/\bstylesheet\b/i.test(el.getAttribute("rel") ?? "")) return;
    // Chromium ignores data: stylesheet links in this sandbox; an inline style keeps the same cascade position.
    const style = createEl("style");
    style.textContent = decodeURIComponent(css[1]);
    if (el.getAttribute("media")) style.media = el.getAttribute("media") ?? "";
    el.replaceWith(style);
  });
  // CSP does not cover preconnect or DNS prefetch, and remote stylesheets would be blocked anyway.
  doc.querySelectorAll("link").forEach(el => el.remove());
  doc.querySelectorAll("style").forEach(el => { if (el !== defaults) el.textContent = replaceCssUrls(el.textContent ?? "", imageOverrides); });
  doc.querySelectorAll("[style]").forEach(el => el.setAttribute("style", replaceCssUrls(el.getAttribute("style") ?? "", imageOverrides)));
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

const NETWORK_GUARD = `for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) delete window[name];`;

const CSS_URL = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

export function cssUrls(css: string): string[] {
  return Array.from(css.matchAll(CSS_URL), match => match[2]);
}

export function replaceCssUrls(css: string, replacements: Record<string, string>): string {
  return css.replace(CSS_URL, (whole: string, _quote: string, url: string) => replacements[url] ? `url("${replacements[url]}")` : whole);
}

export function srcsetUrls(srcset: string): string[] {
  return srcset.split(",").map(candidate => candidate.trim().split(/\s+/)[0]).filter(Boolean);
}

/** Every reference a preview may need inlined: image sources, srcsets, stylesheets and CSS urls. */
export function localReferences(doc: Document): string[] {
  const refs = [
    ...Array.from(doc.querySelectorAll("img[src]"), el => el.getAttribute("src") ?? ""),
    ...Array.from(doc.querySelectorAll("[srcset]"), el => srcsetUrls(el.getAttribute("srcset") ?? "")).flat(),
    ...Array.from(doc.querySelectorAll("link[href]"), el => /\bstylesheet\b/i.test(el.getAttribute("rel") ?? "") ? el.getAttribute("href") ?? "" : ""),
    ...Array.from(doc.querySelectorAll("style"), el => cssUrls(el.textContent ?? "")).flat(),
    ...Array.from(doc.querySelectorAll("[style]"), el => cssUrls(el.getAttribute("style") ?? "")).flat(),
  ];
  return Array.from(new Set(refs.filter(Boolean)));
}

/** CodeMirror normalizes CRLF. Avoid no-op changes and keep the file's newline convention on edit. */
export function preserveLineEndings(edited: string, original: string): string {
  const normalized = (text: string) => text.replace(/\r\n/g, "\n");
  if (normalized(edited) === normalized(original)) return original;
  if (original.includes("\r\n") && !original.replace(/\r\n/g, "").includes("\n")) {
    return normalized(edited).replace(/\n/g, "\r\n");
  }
  return edited;
}
