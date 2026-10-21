import { arrayBufferToBase64, FileView, MarkdownView, Menu, Notice, setIcon, TFile, TFolder, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { buildPreview, cssUrls, localReferences, preserveLineEndings, replaceCssUrls } from "./preview";
import { mountPreviewFrame } from "./preview-frame";
import { attachmentNames, resourceMime, vaultImagePath } from "./image-path";
import type HtmlWorksPlugin from "./main";

export const VIEW_TYPE_HTML = "html-works-html";

/** Keep Obsidian's real editor, editor callbacks, save lifecycle, Vim and registered CM extensions. */
export class HtmlView extends MarkdownView {
  private original = "";
  private previewSource = "";
  private frame: HTMLIFrameElement | null = null;
  private modeButtons = new Map<string, HTMLButtonElement>();
  private scriptsButton: HTMLButtonElement;
  private themeButton: HTMLButtonElement;
  private renderVersion = 0;

  constructor(leaf: WorkspaceLeaf, readonly plugin: HtmlWorksPlugin) {
    super(leaf);
    this.containerEl.addClass("hw-root");
    const toolbar = this.contentEl.createDiv({ cls: "hw-toolbar", attr: { "aria-label": "HTML Works" } });
    this.contentEl.prepend(toolbar);
    toolbar.createSpan({ cls: "hw-brand", text: "HTML Works" });
    for (const [mode, label, icon] of [["preview", "Preview", "book-open"], ["source", "Source", "code-2"]] as const) {
      const button = toolbar.createEl("button", { cls: "hw-btn", attr: { "aria-label": label } });
      setIcon(button.createSpan(), icon);
      button.createSpan({ text: label });
      this.registerDomEvent(button, "click", () => void this.changeMode(mode));
      this.modeButtons.set(mode, button);
    }
    const refresh = toolbar.createEl("button", { cls: "hw-btn hw-icon", attr: { "aria-label": "Refresh preview" } });
    setIcon(refresh, "refresh-cw");
    this.registerDomEvent(refresh, "click", () => this.renderPreview());
    const images = toolbar.createEl("button", { cls: "hw-btn", text: "Images", attr: { "aria-label": "Resolve image files" } });
    this.registerDomEvent(images, "click", () => this.plugin.openImages(this));
    this.themeButton = toolbar.createEl("button", { cls: "hw-btn" });
    this.registerDomEvent(this.themeButton, "click", () => {
      this.plugin.settings.pageTheme = this.plugin.settings.pageTheme === "dark" ? "light" : "dark";
      void this.plugin.saveSettings();
    });
    this.scriptsButton = toolbar.createEl("button", { cls: "hw-btn hw-scripts" });
    this.registerDomEvent(this.scriptsButton, "click", () => void this.toggleScripts());
    // The public preview object remains in place for native mode/resize lifecycle handling.
    // Replace only its data/render methods so Markdown processors never transform HTML source.
    this.previewMode.get = () => this.previewSource;
    this.previewMode.set = (data: string) => { this.previewSource = data; this.renderPreview(); };
    this.previewMode.clear = () => { this.previewSource = ""; this.removePreview(); };
    this.previewMode.rerender = () => this.renderPreview();
    this.syncToolbar();
  }

  getViewType(): string { return VIEW_TYPE_HTML; }
  getIcon(): string { return "file-code-2"; }
  canAcceptExtension(extension: string): boolean { return ["html", "htm"].includes(extension.toLowerCase()); }

  getViewData(): string { return preserveLineEndings(super.getViewData(), this.original); }

  setViewData(data: string, clear: boolean): void {
    this.original = data;
    super.setViewData(data, clear);
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    await super.setState({ ...state, mode: state.mode ?? this.plugin.settings.defaultMode, source: true, backlinks: false }, result);
    this.syncToolbar();
    this.renderPreview();
  }

  async changeMode(mode: "preview" | "source"): Promise<void> {
    await this.leaf.setViewState({ type: VIEW_TYPE_HTML, state: { ...this.getState(), mode, source: true }, active: true });
    if (mode === "source") this.editor.focus();
  }

  // Obsidian's header implementation hardcodes type "markdown". Preserve our registered view type.
  onSwitchView(event?: MouseEvent): void {
    event?.preventDefault();
    void this.changeMode(this.getMode() === "source" ? "preview" : "source");
  }

  onPaneMenu(menu: Menu, source: string): void {
    FileView.prototype.onPaneMenu.call(this, menu, source);
    menu.addItem(item => item.setTitle(this.getMode() === "source" ? "Preview HTML" : "Edit HTML source")
      .setIcon("code-2").onClick(() => this.onSwitchView()));
    menu.addItem(item => item.setTitle("Find in HTML source").setIcon("search").onClick(() => void this.findSource()));
    menu.addItem(item => item.setTitle("Resolve image files").setIcon("image").onClick(() => this.plugin.openImages(this)));
  }

  private async findSource(): Promise<void> {
    this.showSearch();
  }

  showSearch(replace = false): void {
    void this.changeMode("source").then(() => super.showSearch(replace));
  }

  private syncToolbar(): void {
    for (const [mode, button] of this.modeButtons) {
      button.setAttribute("aria-pressed", String(this.getMode() === mode));
      button.toggleClass("is-active", this.getMode() === mode);
    }
    const dark = this.plugin.settings.pageTheme === "dark";
    this.containerEl.setAttribute("data-page-theme", this.plugin.settings.pageTheme);
    this.themeButton.empty();
    setIcon(this.themeButton.createSpan(), dark ? "moon" : "sun");
    this.themeButton.createSpan({ text: dark ? "Dark" : "Light" });
    this.themeButton.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    this.themeButton.setAttribute("aria-pressed", String(dark));
    const trusted = this.isTrusted();
    this.scriptsButton.setText(trusted ? "Scripts on" : "Scripts off");
    this.scriptsButton.setAttribute("aria-label", trusted ? "Disable scripts for this file" : "Enable scripts for this trusted file");
    this.scriptsButton.setAttribute("aria-pressed", String(trusted));
  }

  private isTrusted(): boolean { return !!this.file && this.plugin.settings.trustedFiles.includes(this.file.path); }

  private async toggleScripts(): Promise<void> {
    if (!this.file) return;
    const path = this.file.path;
    if (this.isTrusted()) this.plugin.settings.trustedFiles = this.plugin.settings.trustedFiles.filter(p => p !== path);
    else this.plugin.settings.trustedFiles.push(path);
    await this.plugin.saveSettings();
    new Notice(this.isTrusted() ? "Scripts enabled for this file in an isolated preview." : "Scripts disabled for this file.");
  }

  renderPreview(): void {
    this.syncToolbar();
    if (!this.file) return;
    if (this.getMode() !== "preview") {
      // A trusted page must stop running when its preview is hidden.
      this.removePreview();
      return;
    }
    const version = ++this.renderVersion;
    const file = this.file;
    const source = this.previewSource;
    const trusted = this.isTrusted();
    const theme = this.plugin.settings.pageTheme;
    void this.previewImages(file, source).then(overrides => {
      // Switching tabs, files or modes while images load must never mount an outdated preview.
      if (version !== this.renderVersion || this.file !== file || this.getMode() !== "preview") return;
      const html = buildPreview(source, this.app.vault.getResourcePath(file), trusted, theme, overrides);
      this.frame = mountPreviewFrame(this.previewMode.containerEl, html, trusted);
    });
  }

  private async previewImages(file: TFile, source: string): Promise<Record<string, string>> {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const base = doc.querySelector("base[href]")?.getAttribute("href");
    const choices = this.plugin.settings.imageOverrides[file.path] ?? {};
    const overrides: Record<string, string> = {};
    const pending = new Map<string, Promise<string | undefined>>();
    const load = (path: string, nested = false): Promise<string | undefined> => {
      const target = this.app.vault.getAbstractFileByPath(path);
      const mime = target instanceof TFile ? resourceMime(target.extension) : undefined;
      // Stylesheets are inlined one level deep, which also rules out url() cycles.
      if (!(target instanceof TFile) || !mime || (nested && mime === "text/css")) return Promise.resolve(undefined);
      let data = pending.get(path);
      if (!data) {
        data = (mime === "text/css" ? this.inlineStylesheet(target, load) : this.app.vault.readBinary(target)
          .then(bytes => `data:${mime};base64,${arrayBufferToBase64(bytes)}`)).catch(error => {
          console.warn("HTML Works: could not read preview file", path, error);
          return undefined;
        });
        pending.set(path, data);
      }
      return data;
    };
    const attachments = this.app.vault.getAbstractFileByPath(`${file.path.slice(0, file.path.lastIndexOf("/") + 1)}${file.basename} attachments`);
    const attached = new Map<string, string>();
    if (attachments instanceof TFolder) {
      const names = attachmentNames(Array.from(doc.querySelectorAll("img[src]"), img => img.getAttribute("src") ?? ""));
      const byName = new Map(attachments.children.flatMap(child => child instanceof TFile ? [[child.basename, child.path] as const] : []));
      for (const [src, name] of names) if (byName.has(name)) attached.set(src, byName.get(name) ?? "");
    }
    await Promise.all(localReferences(doc).map(async ref => {
      const path = choices[ref] ?? attached.get(ref) ?? vaultImagePath(file.path, ref, base);
      const uri = path ? await load(path) : undefined;
      if (uri) overrides[ref] = uri;
    }));
    return overrides;
  }

  /** A data: stylesheet has no folder, so its own relative urls are inlined against the CSS file first. */
  private async inlineStylesheet(file: TFile, load: (path: string, nested: boolean) => Promise<string | undefined>): Promise<string> {
    const css = await this.app.vault.read(file);
    const replacements: Record<string, string> = {};
    await Promise.all(cssUrls(css).map(async url => {
      const path = vaultImagePath(file.path, url);
      const uri = path ? await load(path, true) : undefined;
      if (uri) replacements[url] = uri;
    }));
    return `data:text/css;charset=utf-8,${encodeURIComponent(replaceCssUrls(css, replacements))}`;
  }

  private removePreview(): void {
    ++this.renderVersion;
    this.frame?.remove();
    this.frame = null;
  }
}
