import { describe, expect, it } from "vitest";
import { mountPreviewFrame, wrapPreview } from "../src/preview-frame";

describe("preview lifecycle", () => {
  it("gives a returning preview a new browsing context instead of reusing a hidden iframe", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const first = mountPreviewFrame(container, "<h1>First preview</h1>", false);
    container.hidden = true;
    container.hidden = false;
    const second = mountPreviewFrame(container, "<h1>Updated preview</h1>", false);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(second.srcdoc).toContain("Updated preview");
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
    container.remove();
  });

  it("applies sandbox and privacy settings before mounting, preserving the native reading view", () => {
    const container = document.createElement("div");
    const native = document.createElement("div");
    container.append(native);
    const frame = mountPreviewFrame(container, "<p>HTML</p>", false);
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.referrerPolicy).toBe("no-referrer");
    expect(native.parentElement).toBe(container);
    const trusted = mountPreviewFrame(container, "<p>Trusted HTML</p>", true);
    expect(trusted.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("nests the page in a frame whose policy blocks the page navigating anywhere", () => {
    const html = '<p title="a&quot;b">Tom & "Jerry"</p><script>location.href="https://example.com"</script>';
    const outer = new DOMParser().parseFromString(wrapPreview(html, true), "text/html");
    expect(outer.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toBe("frame-src 'none'");
    const inner = outer.querySelector("iframe");
    expect(inner?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(inner?.getAttribute("srcdoc")).toBe(html);
    expect(new DOMParser().parseFromString(wrapPreview(html, false), "text/html").querySelector("iframe")?.getAttribute("sandbox")).toBe("");
  });
});
