import { vi } from "vitest";

vi.stubGlobal("createEl", (tag: string) => document.createElement(tag));
