import { sandboxFor } from "./preview";

/**
 * Hidden native reading views can leave an iframe's document without a layout on return, so each render mounts a new frame.
 * The page runs inside a second frame: CSP cannot stop a document navigating itself, but its parent's frame-src
 * blocks that navigation before any request is made.
 */
export function mountPreviewFrame(container: HTMLElement, html: string, trusted: boolean): HTMLIFrameElement {
  const frame = createEl("iframe");
  frame.className = "hw-preview";
  frame.title = "HTML preview";
  frame.setAttribute("sandbox", sandboxFor(trusted));
  frame.referrerPolicy = "no-referrer";
  frame.srcdoc = wrapPreview(html, trusted);
  const previous = container.querySelector("iframe.hw-preview");
  if (previous) previous.replaceWith(frame);
  else container.append(frame);
  return frame;
}

export function wrapPreview(html: string, trusted: boolean): string {
  const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="frame-src 'none'">`
    + "<style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block;overflow:hidden}</style></head>"
    + `<body><iframe sandbox="${sandboxFor(trusted)}" referrerpolicy="no-referrer" title="HTML preview" srcdoc="${attribute(html)}"></iframe></body></html>`;
}
