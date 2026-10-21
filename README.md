# HTML Works

Open `.html` and `.htm` files in Obsidian, preview their contents, and edit their source in the native editor.

HTML Works and [Doc Works](https://github.com/zarnuq/DocWorks) are a matching pair: separate plugins with the same compact toolbar, native theme colours, light/dark paper options, file creation commands, and in-vault editing. Neither requires the other.

## Use

- Open an HTML file from the file explorer or a note link. It opens in **Preview** by default.
- Click **Source** to edit, then **Preview** to see the result. The header reading/editing button also switches modes. Each tab remembers its mode.
- Source editing uses an actual `MarkdownView` subclass and Obsidian's own editor, autosave, undo history, search, and editor extensions. Enable Vim in Obsidian's Editor settings as usual. Plugins that explicitly restrict themselves to `.md` files or the `markdown` view type can still exclude HTML Works; compatibility with every editor plugin is not guaranteed.
- Use **HTML Works: New HTML file** or a folder's context menu to create a file.
- Use the **Light / Dark** toolbar button to switch paper theme. The opening mode and paper theme are also available under **Settings → HTML Works**.

The preview handles complete HTML documents and HTML fragments, including styles, tables, and images. Page styles are isolated from Obsidian. Preview formatting never rewrites your HTML; only source edits are saved. Untouched source retains its exact text, including CRLF line endings.

## Images

Relative image, stylesheet and CSS `url()` paths resolve from the HTML file's own folder, including `srcset` candidates. Paths containing spaces and inline data images are supported. A relative `<base href>` is resolved against that folder.

Local vault files are embedded as data URLs in the disposable preview. This lets them load inside the sandbox without giving the page access to the parent application. The HTML source keeps its original paths.

The preview never uses the network. Remote images, stylesheets, fonts and links do not load; a remote image shows its alt text unless a vault copy is available. HTML Works only reads vault files to find one, in this order:

1. A choice made with **Images → Choose vault image**. It is stored in plugin settings, follows file renames, and does not change the source.
2. The [Doc Works](https://github.com/zarnuq/DocWorks) attachments layout: a `<name> attachments` folder beside `<name>.html`, with remote images numbered by first use as `image-1.png`, `image-2.jpg` and so on.

## Scripts

Scripts start disabled. **Scripts off** enables them for that individual trusted file; **Scripts on** disables them again. Even trusted pages remain sandboxed without access to the parent app, popups, forms, or top-level navigation. Embedded frames and objects are blocked. Trusted scripts get no network access either: requests, WebRTC, and navigating the preview to another page are all blocked. Script-dependent content may require enabling scripts. Preview scripts stop when you switch to source.

## Install

From this project:

```sh
npm ci
npm run install:plugin -- /path/to/vault
```

Then enable **HTML Works** in **Settings → Community plugins**. For manual installation, copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/html-works/`. Disable another plugin's HTML file handling if it already owns these extensions.

## Development

```sh
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run check:live
```

To check real course exports without modifying them:

```sh
HTML_WORKS_NOTES=/path/to/course npm test
```

Automated checks cover preview policies, iframe lifecycle, theme colours, image paths and overrides, source fidelity, and the optional real-file corpus. `check:live` uses a disposable tab and scratch HTML/SVG files in the open vault to check source-to-preview switching, editing, browser image loading, sandboxing, and the toolbar theme switch. It cleans up its scratch files and restores the previous theme afterward. Install and reload the latest build before running it. Native Vim input, third-party editor extensions, and mobile behaviour require separate manual checks.

For development, `node scripts/reload-live.mjs` temporarily loads the workspace build into the running app through its native plugin loader, preserving open HTML tabs. It does not replace installed files; restarting or reloading the plugin returns to the installed build. Use the installer for a persistent update.

GPL-3.0, like Doc Works.
