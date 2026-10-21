import { describe, expect, it } from "vitest";
import { mountPreviewFrame } from "../src/preview-frame";

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
});
