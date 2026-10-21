export interface HtmlWorksSettings {
  defaultMode: "preview" | "source";
  pageTheme: "light" | "dark";
  trustedFiles: string[];
  imageOverrides: Record<string, Record<string, string>>;
}

export const DEFAULT_SETTINGS: HtmlWorksSettings = {
  defaultMode: "preview",
  pageTheme: "light",
  trustedFiles: [],
  imageOverrides: {},
};
