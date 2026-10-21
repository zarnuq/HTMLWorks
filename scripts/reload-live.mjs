import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Development-only: load the workspace build into the running app without writing installed files.
async function reloadFromWorkspace(root) {
  const fs = require("fs");
  const manager = app.plugins;
  const id = "html-works";
  const manifest = manager.manifests[id];
  if (!manifest) throw Error("Install HTML Works first");
  const bundle = fs.readFileSync(`${root}/main.js`, "utf8");
  const css = fs.readFileSync(`${root}/styles.css`, "utf8");
  const tabs = app.workspace.getLeavesOfType("html-works-html").map(leaf => ({
    leaf, state: leaf.getViewState(), ephemeral: leaf.view.getEphemeralState(),
  }));
  for (const tab of tabs) await tab.leaf.view.save();
  await manager.unloadPlugin(id);
  const adapter = app.vault.adapter;
  const originalRead = adapter.read;
  try {
    // Let the native plugin loader supply its API imports, but read this build from memory.
    // No installed file is written, and all unrelated vault reads keep their original behaviour.
    adapter.read = function(path, ...args) {
      if (path === `${manifest.dir}/main.js`) return Promise.resolve(bundle);
      if (path === `${manifest.dir}/styles.css`) return Promise.resolve(css);
      return originalRead.call(this, path, ...args);
    };
    let plugin;
    try { plugin = await manager.loadPlugin(id); }
    finally { adapter.read = originalRead; }
    if (!plugin) throw Error("Workspace build did not load");
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    plugin.register(() => style.remove());
    for (const tab of tabs) {
      await tab.leaf.setViewState(tab.state);
      tab.leaf.view.setEphemeralState(tab.ephemeral);
    }
    return { ok: true, temporary: true, restoredTabs: tabs.length };
  } catch (error) {
    adapter.read = originalRead;
    await manager.unloadPlugin(id);
    await manager.loadPlugin(id);
    for (const tab of tabs) await tab.leaf.setViewState(tab.state);
    throw error;
  }
}

const code = `(async()=>{try{return JSON.stringify(await (${reloadFromWorkspace.toString()})(${JSON.stringify(resolve("."))}))}catch(error){return JSON.stringify({ok:false,error:String(error.stack??error)})}})()`;
if (process.argv[2] === "--emit-code") writeFileSync(process.argv[3], code);
else {
  const output = execFileSync(process.env.OBSIDIAN_CLI || "/home/miles/.nix-profile/bin/obsidian-cli", ["eval", `code=${code}`], { encoding: "utf8", timeout: 30000 });
  console.log(output.trim());
  if (!output.includes('"ok":true')) process.exitCode = 1;
}
