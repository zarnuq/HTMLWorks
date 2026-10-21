import { describe, expect, it } from "vitest";
import { buildPreview, localReferences, preserveLineEndings, sandboxFor } from "../src/preview";

describe("HTML preview", () => {
  it("keeps file styles inside a complete, isolated document", () => {
    const source = '<!doctype html><html lang="en"><head><title>Example</title><style>body{color:red}</style></head><body><h1>Hi</h1></body></html>';
    const result = buildPreview(source, "app://local/vault/pages/example.html?123", false, "light");
    const doc = new DOMParser().parseFromString(result, "text/html");
    expect(doc.title).toBe("Example");
    expect(Array.from(doc.querySelectorAll("style"), el => el.textContent).join("\n")).toContain("color:red");
    expect(doc.querySelector("h1")?.textContent).toBe("Hi");
    expect(doc.querySelector("base")?.href).toBe("app://local/vault/pages/");
    expect(doc.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(doc.head.firstElementChild?.getAttribute("content")).toContain("script-src 'none'");
  });

  it("renders fragments and removes refresh navigation", () => {
    const doc = new DOMParser().parseFromString(buildPreview('<meta http-equiv="Refresh" content="0;url=https://example.com"><p>Fragment</p>', "app://local/vault/a.html", false, "dark"), "text/html");
    expect(doc.querySelector("p")?.textContent).toBe("Fragment");
    expect(doc.querySelector('[http-equiv="Refresh"]')).toBeNull();
    expect(doc.querySelector('meta[name="color-scheme"]')?.getAttribute("content")).toBe("dark");
  });

  it("gives dark and light pages explicit readable foreground and background colours", () => {
    const parse = (theme: "light" | "dark") => new DOMParser().parseFromString(buildPreview("<p>Text</p>", "app://local/vault/a.html", false, theme), "text/html");
    expect(parse("dark").querySelector("style")?.textContent).toContain("background-color:#1e1e2e;color:#dcdef1");
    expect(parse("light").querySelector("style")?.textContent).toContain("background-color:#ffffff;color:#222222");
  });

  it("resolves an author base relative to the file directory", () => {
    const doc = new DOMParser().parseFromString(buildPreview('<base href="../assets/"><img src="photo.png">', "app://local/vault/pages/a.htm", false, "light"), "text/html");
    expect(doc.querySelector("base")?.getAttribute("href")).toBe("app://local/vault/assets/");
    expect(doc.querySelectorAll("base")).toHaveLength(1);
  });

  it("never grants same-origin, navigation, popups or forms when trusting scripts", () => {
    expect(sandboxFor(false)).toBe("");
    expect(sandboxFor(true)).toBe("allow-scripts");
    const result = buildPreview('<script>document.body.textContent="Hello"</script>', "app://local/vault/a.html", true, "light");
    expect(result).toContain("script-src 'unsafe-inline'");
    expect(result).toContain("document.body.textContent");
  });

  it("never reaches the network, even for trusted scripts, links or prefetch hints", () => {
    for (const trusted of [false, true]) {
      const result = buildPreview('<link rel="dns-prefetch" href="//psu.instructure.com"><p>Text</p>', "app://local/vault/a.html", trusted, "light");
      const doc = new DOMParser().parseFromString(result, "text/html");
      const policy = doc.head.firstElementChild?.getAttribute("content") ?? "";
      expect(policy).not.toMatch(/https?:/);
      expect(policy).toContain("connect-src 'none'");
      expect(doc.querySelector("link")).toBeNull();
      expect(doc.querySelector('meta[http-equiv="x-dns-prefetch-control"]')?.getAttribute("content")).toBe("off");
    }
  });

  it("removes WebRTC before any author script, only when scripts run", () => {
    const parse = (trusted: boolean) => new DOMParser().parseFromString(buildPreview('<head><script>location.href="https://example.com"</script></head>', "app://local/vault/a.html", trusted, "light"), "text/html");
    const scripts = Array.from(parse(true).scripts, el => el.textContent ?? "");
    expect(scripts).toHaveLength(2);
    expect(scripts[0]).toContain("RTCPeerConnection");
    expect(parse(false).scripts).toHaveLength(1);
  });

  it("restricts embedded frames and connections by default", () => {
    const result = buildPreview("<p>Hello</p>", "app://local/vault/a.html", false, "light");
    expect(result).toContain("frame-src 'none'");
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("form-action 'none'");
  });

  it("resolves images with spaces and percent-encoded paths relative to the HTML file", () => {
    const result = buildPreview('<img src="../files/Network%20diagram.png"><img src="same folder.svg">', "app://local/vault/Course%20notes/lesson/page.html?123", false, "light");
    const doc = new DOMParser().parseFromString(result, "text/html");
    expect(Array.from(doc.images, img => img.src)).toEqual([
      "app://local/vault/Course%20notes/files/Network%20diagram.png",
      "app://local/vault/Course%20notes/lesson/same%20folder.svg",
    ]);
  });

  it("keeps remote and inline images available without enabling scripts", () => {
    const doc = new DOMParser().parseFromString(buildPreview('<img src="https://example.com/image.png"><img src="data:image/png;base64,YQ==">', "app://local/vault/a.html", false, "light"), "text/html");
    expect(doc.images[0].src).toBe("https://example.com/image.png");
    expect(doc.images[1].src).toBe("data:image/png;base64,YQ==");
  });

  it("uses chosen vault images in place of authenticated course links, including picture sources", () => {
    const src = "https://psu.instructure.com/courses/1/files/123/preview?";
    const source = `<picture><source srcset="https://example.com/other.png"><img src="${src}" srcset="https://example.com/big.png 2x" alt="Diagram"></picture>`;
    const doc = new DOMParser().parseFromString(buildPreview(source, "app://local/vault/a.html", false, "light", { [src]: "app://local/vault/files/diagram.png" }), "text/html");
    expect(doc.images[0].src).toBe("app://local/vault/files/diagram.png");
    expect(doc.images[0].alt).toBe("Diagram");
    expect(doc.images[0].hasAttribute("srcset")).toBe(false);
    expect(doc.querySelector("source")).toBeNull();
    expect(source).toContain(src);
  });
});

describe("inlined local resources", () => {
  it("finds and rewrites srcsets, stylesheets and CSS urls, leaving unknown references alone", () => {
    const source = '<link rel="stylesheet" href="s.css"><link rel="icon" href="i.png"><style>.a{background:url("bg.png")} .b{background:url(remote.png)}</style><img srcset="a.png 1x,b.png 2x"><div style="background-image:url(\'bg.png\')"></div>';
    expect(localReferences(new DOMParser().parseFromString(source, "text/html")).sort()).toEqual(["a.png", "b.png", "bg.png", "remote.png", "s.css"]);
    const map = { "s.css": "data:text/css;charset=utf-8,h1%7Bcolor%3Ared%7D", "a.png": "data:image/png;base64,QQ==", "bg.png": "data:image/png;base64,Qg==" };
    const doc = new DOMParser().parseFromString(buildPreview(source, "app://local/vault/a.html", false, "light", map), "text/html");
    expect(doc.querySelector("link")).toBeNull();
    expect(doc.querySelectorAll("style")[1].textContent).toBe("h1{color:red}");
    expect(doc.querySelector("img")?.getAttribute("srcset")).toBe("data:image/png;base64,QQ== 1x, b.png 2x");
    expect(doc.querySelectorAll("style")[2].textContent).toBe('.a{background:url("data:image/png;base64,Qg==")} .b{background:url(remote.png)}');
    expect(doc.querySelector("div")?.getAttribute("style")).toBe('background-image:url("data:image/png;base64,Qg==")');
  });
});

describe("source fidelity", () => {
  it("returns untouched source byte for byte even if the editor normalizes newlines", () => {
    const original = '\ufeff<!DOCTYPE HTML>\r\n<p title=\'hello\'>Hello &amp; goodbye</p>\r\n';
    expect(preserveLineEndings(original.replace(/\r\n/g, "\n"), original)).toBe(original);
  });

  it("preserves CRLF when editing a CRLF file", () => {
    expect(preserveLineEndings("<p>Changed</p>\n", "<p>Original</p>\r\n")).toBe("<p>Changed</p>\r\n");
  });

  it("keeps LF files as LF", () => {
    expect(preserveLineEndings("new\n", "old\n")).toBe("new\n");
  });
});
