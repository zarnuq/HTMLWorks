import { App, normalizePath, Notice, Plugin, PluginSettingTab, Setting, SettingDefinitionItem, TFile, TFolder } from "obsidian";
import { HtmlView, VIEW_TYPE_HTML } from "./html-view";
import { ImagesModal } from "./images";
import { resourceMime } from "./image-path";
import { DEFAULT_SETTINGS, HtmlWorksSettings } from "./settings";

export default class HtmlWorksPlugin extends Plugin {
  settings: HtmlWorksSettings = { ...DEFAULT_SETTINGS, trustedFiles: [], imageOverrides: {} };

  async onload(): Promise<void> {
    const saved = await this.loadData() as Partial<HtmlWorksSettings> | null;
    this.settings = { ...this.settings, ...saved };
    this.registerView(VIEW_TYPE_HTML, leaf => new HtmlView(leaf, this));
    this.registerExtensions(["html", "htm"], VIEW_TYPE_HTML);
    this.addSettingTab(new HtmlWorksSettingTab(this.app, this));
    this.addCommand({ id: "new-html", name: "New HTML file", callback: () => void this.createFile() });
    for (const [id, name, mode] of [
      ["preview-html", "Preview HTML", "preview"],
      ["edit-html", "Edit HTML source", "source"],
    ] as const) {
      this.addCommand({ id, name, checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(HtmlView);
        if (!view) return false;
        if (!checking) void view.changeMode(mode);
        return true;
      } });
    }
    this.addCommand({ id: "toggle-html", name: "Toggle HTML preview / source", checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(HtmlView);
      if (!view) return false;
      if (!checking) view.onSwitchView();
      return true;
    } });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (file instanceof TFolder) menu.addItem(item => item.setTitle("New HTML file").setIcon("file-code-2").onClick(() => void this.createFile(file)));
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) return;
      this.settings.trustedFiles = this.settings.trustedFiles.map(path => path === oldPath ? file.path : path);
      const overrides = this.settings.imageOverrides[oldPath];
      if (overrides) {
        this.settings.imageOverrides[file.path] = overrides;
        delete this.settings.imageOverrides[oldPath];
      }
      for (const choices of Object.values(this.settings.imageOverrides)) {
        for (const [src, path] of Object.entries(choices)) if (path === oldPath) choices[src] = file.path;
      }
      void this.saveSettings();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (!(file instanceof TFile)) return;
      this.settings.trustedFiles = this.settings.trustedFiles.filter(path => path !== file.path);
      delete this.settings.imageOverrides[file.path];
      void this.saveSettings();
    }));
    this.registerEvent(this.app.vault.on("modify", file => {
      // Only files a preview can inline; re-rendering on every note edit would reset scroll and restart scripts.
      if (file instanceof TFile && resourceMime(file.extension)) this.refreshViews();
    }));
  }

  openImages(view: HtmlView): void { new ImagesModal(this, view).open(); }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HTML)) {
      if (leaf.view instanceof HtmlView) leaf.view.renderPreview();
    }
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); this.refreshViews(); }

  private async createFile(folder?: TFolder): Promise<void> {
    const parent = folder ?? this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? "");
    const prefix = parent.isRoot() ? "" : `${parent.path}/`;
    let path = normalizePath(`${prefix}Untitled.html`);
    for (let n = 1; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${prefix}Untitled ${n}.html`);
    try {
      const file = await this.app.vault.create(path, '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Untitled</title>\n</head>\n<body>\n  <h1>Untitled</h1>\n  <p>Start writing here.</p>\n</body>\n</html>\n');
      const leaf = this.app.workspace.getLeaf("tab");
      await leaf.openFile(file);
      if (leaf.view instanceof HtmlView) await leaf.view.changeMode("source");
    } catch (error) {
      console.error("HTML Works: could not create file", error);
      new Notice("Could not create the HTML file. Check the destination folder.");
    }
  }
}

class HtmlWorksSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: HtmlWorksPlugin) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] { return this.rows(); }

  private rows(): { name: string; desc: string; render: (setting: Setting) => void }[] {
    return [
      { name: "Opening mode", desc: "Choose how .html and .htm files first open. Each tab remembers its mode.", render: setting => {
        setting.addDropdown(dropdown => dropdown.addOption("preview", "Preview").addOption("source", "Source")
        .setValue(this.plugin.settings.defaultMode).onChange(async value => {
          this.plugin.settings.defaultMode = value === "source" ? "source" : "preview";
          await this.plugin.saveSettings();
        }));
      } },
      { name: "Page theme", desc: "Default paper colour. The file’s own styles take precedence.", render: setting => {
        setting.addDropdown(dropdown => dropdown.addOption("light", "Light").addOption("dark", "Dark")
        .setValue(this.plugin.settings.pageTheme).onChange(async value => {
          this.plugin.settings.pageTheme = value === "dark" ? "dark" : "light";
          await this.plugin.saveSettings();
        }));
      } },
      { name: "Trusted files", desc: "Use the scripts button to trust individual files. You can disable scripts in all files here.", render: setting => {
        setting.addButton(button => button.setButtonText("Disable all scripts").onClick(async () => {
        this.plugin.settings.trustedFiles = [];
        await this.plugin.saveSettings();
      }));
      } },
    ];
  }

  // Compatibility with versions before searchable settings were introduced.
  display(): void {
    this.containerEl.empty();
    for (const row of this.rows()) row.render(new Setting(this.containerEl).setName(row.name).setDesc(row.desc));
  }
}
