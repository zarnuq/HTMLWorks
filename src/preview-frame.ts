import { sandboxFor } from "./preview";

/** Hidden native reading views can leave an iframe's document without a layout on return. */
export function mountPreviewFrame(container: HTMLElement, html: string, trusted: boolean): HTMLIFrameElement {
  const frame = createEl("iframe");
  frame.className = "hw-preview";
  frame.title = "HTML preview";
  frame.setAttribute("sandbox", sandboxFor(trusted));
  frame.referrerPolicy = "no-referrer";
  frame.srcdoc = html;
  const previous = container.querySelector("iframe.hw-preview");
  if (previous) previous.replaceWith(frame);
  else container.append(frame);
  return frame;
}
