import { App, FuzzySuggestModal, Modal, TFile } from "obsidian";
import type { HtmlView } from "./html-view";
import type HtmlWorksPlugin from "./main";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "bmp"]);

class ImagePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private source: TFile, private choose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder("Choose a vault image");
  }
  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(file => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()))
      .sort((a, b) => Number(b.parent === this.source.parent) - Number(a.parent === this.source.parent) || a.path.localeCompare(b.path));
  }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}

export class ImagesModal extends Modal {
  constructor(private plugin: HtmlWorksPlugin, private view: HtmlView) { super(plugin.app); }

  onOpen(): void {
    const file = this.view.file;
    if (!file) return;
    this.setTitle("HTML images");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: "Relative image paths load from the HTML file’s folder. For course links that need a login, choose a downloaded image from your vault. These choices only affect the preview." });
    const doc = new DOMParser().parseFromString(this.view.getViewData(), "text/html");
    const images = new Map<string, string>();
    doc.querySelectorAll("img[src]").forEach(img => images.set(img.getAttribute("src") ?? "", img.getAttribute("alt") ?? ""));
    if (images.size === 0) contentEl.createEl("p", { text: "No image tags found in this file." });
    for (const [src, alt] of images) {
      const row = contentEl.createDiv("hw-image-row");
      row.createEl("strong", { text: alt || "Image" });
      row.createDiv({ cls: "hw-image-source", text: src });
      const selected = this.plugin.settings.imageOverrides[file.path]?.[src];
      if (selected) row.createDiv({ text: `Vault image: ${selected}` });
      const choose = row.createEl("button", { text: selected ? "Change image" : "Choose vault image" });
      choose.addEventListener("click", () => new ImagePicker(this.app, file, image => void (async () => {
        const overrides = this.plugin.settings.imageOverrides[file.path] ??= {};
        overrides[src] = image.path;
        await this.plugin.saveSettings();
        this.onOpen();
      })()).open());
      if (selected) {
        const reset = row.createEl("button", { text: "Use original link" });
        reset.addEventListener("click", () => void (async () => {
          delete this.plugin.settings.imageOverrides[file.path]?.[src];
          await this.plugin.saveSettings();
          this.onOpen();
        })());
      }
    }
  }

  onClose(): void { this.contentEl.empty(); }
}
