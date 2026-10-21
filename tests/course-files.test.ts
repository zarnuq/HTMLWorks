import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPreview } from "../src/preview";

const root = process.env.HTML_WORKS_NOTES;
function htmlFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : /\.html?$/i.test(entry.name) ? [path] : [];
  });
}

describe.skipIf(!root)("real course exports (read only)", () => {
  for (const path of root ? htmlFiles(root) : []) {
    it(path, () => {
      const source = readFileSync(path, "utf8");
      const parse = (text: string) => new DOMParser().parseFromString(text, "text/html");
      const original = parse(source);
      const preview = parse(buildPreview(source, `app://local/${path.split("/").map(encodeURIComponent).join("/")}`, false, "light"));
      expect(preview.body.textContent).toBe(original.body.textContent);
      expect(Array.from(preview.images, img => img.getAttribute("src"))).toEqual(Array.from(original.images, img => img.getAttribute("src")));
      expect(preview.querySelectorAll("h1,h2,h3,h4,table,a").length).toBe(original.querySelectorAll("h1,h2,h3,h4,table,a").length);
      expect(readFileSync(path, "utf8")).toBe(source);
    });
  }
});
