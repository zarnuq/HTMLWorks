import { access, copyFile, mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const vault = process.argv[2];
if (!vault) {
  console.error('Usage: npm run install:plugin -- "/path/to/vault"');
  process.exit(1);
}
const config = join(resolve(vault), ".obsidian");
await access(config); // Refuse a mistaken path instead of creating a new vault.
const destination = join(config, "plugins", "html-works");
await mkdir(destination, { recursive: true });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of ["main.js", "manifest.json", "styles.css"]) await copyFile(join(root, file), join(destination, file));
console.log(`Installed HTML Works in ${destination}. Enable it in Settings → Community plugins.`);
