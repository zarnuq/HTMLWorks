import { describe, expect, it } from "vitest";
import { attachmentNames, resourceMime, vaultImagePath } from "../src/image-path";

describe("vault images in sandboxed previews", () => {
  it("resolves sibling and parent image paths with spaces and encoded characters", () => {
    expect(vaultImagePath("Course/Lesson/page.html", "my image.svg")).toBe("Course/Lesson/my image.svg");
    expect(vaultImagePath("Course/Lesson/page.html", "../files/Diagram%20%231.png?cache=1")).toBe("Course/files/Diagram #1.png");
  });
  it("honours relative author bases and vault-root paths", () => {
    expect(vaultImagePath("Course/Lesson/page.html", "one.png", "../assets/")).toBe("Course/assets/one.png");
    expect(vaultImagePath("Course/Lesson/page.html", "/assets/one.png")).toBe("assets/one.png");
  });
  it("leaves external, inline, fragment and malformed image sources alone", () => {
    for (const source of ["https://example.com/photo.jpg", "//example.com/photo.jpg", "data:image/png;base64,YQ==", "#icon", "", "bad%XX.png"]) {
      expect(vaultImagePath("Course/page.html", source)).toBeUndefined();
    }
    expect(vaultImagePath("Course/page.html", "photo.jpg", "https://example.com/assets/")).toBeUndefined();
  });
  it("uses real image MIME types for data URLs", () => {
    expect(resourceMime("SVG")).toBe("image/svg+xml");
    expect(resourceMime("jpg")).toBe("image/jpeg");
    expect(resourceMime("css")).toBe("text/css");
    expect(resourceMime("html")).toBeUndefined();
  });
  it("numbers remote images by first use, like Doc Works attachments", () => {
    const names = attachmentNames(["https://a/1", "local.png", "data:image/png;base64,YQ==", "//b/2", "https://a/1", "https://c/3"]);
    expect(Object.fromEntries(names)).toEqual({ "https://a/1": "image-1", "//b/2": "image-2", "https://c/3": "image-3" });
  });
});
