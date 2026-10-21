import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// Run against the user's open app, using only disposable files and a separate tab.
async function checkLive() {
  const plugin = app.plugins.plugins["html-works"];
  if (!plugin) throw Error("HTML Works is not loaded");
  const prefix = `html-works-check-${Date.now()}`;
  const htmlPath = `${prefix}.html`;
  const imagePath = `${prefix} image.svg`;
  const paths = [htmlPath, imagePath];
  const previous = app.workspace.activeLeaf;
  const originalTheme = plugin.settings.pageTheme;
  const pause = () => new Promise(resolve => setTimeout(resolve, 180));
  const source = `<!doctype html>\r\n<h1>HTML Works live check</h1>\r\n<img src="${imagePath}">\r\n<script>document.body.dataset.untrustedScript="ran"</script>\r\n`;
  let leaf;
  const results = [];
  const debuggerApi = require("electron").remote.getCurrentWebContents().debugger;
  // Detach afterwards only if this check attached, so an open DevTools session keeps its debugger.
  const attachedByCheck = !debuggerApi.isAttached();
  if (attachedByCheck) debuggerApi.attach("1.3");
  const assert = (condition, message) => { if (!condition) throw Error(message); };

  async function inspect(view) {
    const frame = view.contentEl.querySelector("iframe.hw-preview");
    assert(frame, "Preview iframe missing");
    frame.setAttribute("data-html-works-check", prefix);
    let targetId;
    for (let attempt = 0; attempt < 20; attempt++) {
      view.contentEl.querySelector("iframe.hw-preview")?.setAttribute("data-html-works-check", prefix);
      const { root } = await debuggerApi.sendCommand("DOM.getDocument", { depth: 0 });
      const { nodeId } = await debuggerApi.sendCommand("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-html-works-check="${prefix}"]` });
      if (nodeId) {
        const { node } = await debuggerApi.sendCommand("DOM.describeNode", { nodeId });
        const { targetInfos } = await debuggerApi.sendCommand("Target.getTargets");
        if (targetInfos.some(target => target.targetId === node.frameId && target.type === "iframe")) {
          targetId = node.frameId;
          break;
        }
      }
      await pause();
    }
    assert(targetId, "Preview frame did not finish loading");
    const { sessionId } = await debuggerApi.sendCommand("Target.attachToTarget", { targetId, flatten: true });
    try {
      // The page is the wrapper's only child frame; an isolated world can read its DOM.
      let page;
      for (let attempt = 0; !page && attempt < 20; attempt++) {
        const { frameTree } = await debuggerApi.sendCommand("Page.getFrameTree", {}, sessionId);
        page = frameTree.childFrames?.[0]?.frame;
        if (!page) await pause();
      }
      assert(page?.url === "about:srcdoc", `Preview page frame missing or navigated: ${page?.unreachableUrl ?? page?.url}`);
      const { executionContextId } = await debuggerApi.sendCommand("Page.createIsolatedWorld", { frameId: page.id, worldName: prefix }, sessionId);
      const { result, exceptionDetails } = await debuggerApi.sendCommand("Runtime.evaluate", {
        contextId: executionContextId,
        expression: `JSON.stringify({width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height,text:document.body.innerText,imageWidth:document.images[0]?.naturalWidth,imageComplete:document.images[0]?.complete,imageSource:document.images[0]?.currentSrc,background:getComputedStyle(document.documentElement).backgroundColor,color:getComputedStyle(document.body).color,scriptRan:!!document.body.dataset.untrustedScript})`,
        returnByValue: true,
      }, sessionId);
      assert(!exceptionDetails, "Could not inspect iframe document");
      return JSON.parse(result.value);
    } finally {
      await debuggerApi.sendCommand("Target.detachFromTarget", { sessionId });
    }
  }

  try {
    await app.vault.create(imagePath, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="green"/></svg>');
    const file = await app.vault.create(htmlPath, source);
    leaf = app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    const view = leaf.view;
    assert(view.file?.path === htmlPath, "Wrong scratch file");
    assert(typeof view.removePreview === "function", "Install and reload the fixed build before running this check");
    for (let cycle = 0; cycle < 4; cycle++) {
      assert(view.file?.path === htmlPath, "Scratch view changed");
      await view.changeMode("source");
      assert(!view.contentEl.querySelector("iframe"), "Hidden preview was not removed");
      if (cycle === 0) view.editor.replaceRange('<p id="edited">Source edit saved</p>\n', { line: view.editor.lastLine(), ch: 0 });
      await view.changeMode("preview");
      await pause();
      let state = await inspect(view);
      for (let attempt = 0; !state.imageComplete && attempt < 15; attempt++) {
        await pause();
        state = await inspect(view);
      }
      assert(state.width > 0 && state.height > 0, `Blank preview after cycle ${cycle}: ${JSON.stringify(state)}`);
      assert(state.text.includes("Source edit saved"), "Source edit missing from preview");
      assert(!state.scriptRan, "Untrusted script executed");
      assert(state.imageComplete && state.imageWidth === 40, `Relative vault image did not load: ${JSON.stringify(state)}`);
      results.push({ cycle, ...state });
    }
    for (const theme of ["dark", "light"]) {
      if (plugin.settings.pageTheme !== theme) {
        const button = view.contentEl.querySelector(`[aria-label="Switch to ${theme} mode"]`);
        assert(button, "Toolbar theme switch missing");
        button.click();
        await pause();
      }
      const state = await inspect(view);
      assert(state.width > 0, "Theme change left a blank preview");
      assert(state.background === (theme === "dark" ? "rgb(30, 30, 46)" : "rgb(255, 255, 255)"), `Wrong ${theme} background`);
      results.push({ theme, ...state });
    }
    const saved = await app.vault.read(file);
    assert(saved.includes("Source edit saved") && saved.includes("\r\n"), "Source edits or CRLF line endings were not saved");
    return { ok: true, results };
  } finally {
    if (attachedByCheck && debuggerApi.isAttached()) debuggerApi.detach();
    plugin.settings.pageTheme = originalTheme;
    await plugin.saveSettings();
    if (leaf?.view.file?.path === htmlPath) {
      if (app.workspace.activeLeaf === leaf && previous) app.workspace.setActiveLeaf(previous, { focus: true });
      leaf.detach();
    }
    for (const path of paths) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file?.path === path) await app.vault.delete(file, true);
    }
  }
}

const code = `(async()=>{try{return JSON.stringify(await (${checkLive.toString()})())}catch(error){return JSON.stringify({ok:false,error:String(error.stack??error)})}})()`;
if (process.argv[2] === "--emit-code") writeFileSync(process.argv[3], code);
else {
  const output = execFileSync(process.env.OBSIDIAN_CLI || "/home/miles/.nix-profile/bin/obsidian-cli", ["eval", `code=${code}`], { encoding: "utf8", timeout: 30000 });
  console.log(output.trim());
  if (!output.includes('"ok":true')) process.exitCode = 1;
}
