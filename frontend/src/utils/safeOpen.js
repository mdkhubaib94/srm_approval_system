// Hardened wrapper around window.open.
//
// Every caller in this app passes a blob: URL from URL.createObjectURL (attachment
// and spreadsheet previews). We still validate the scheme so a value that ever
// became `javascript:` or `data:text/html` cannot be executed via a new tab, and
// we always pass noopener,noreferrer so the opened document can't reach back
// through window.opener. Only blob: and http(s) URLs are allowed through.
const SAFE_SCHEME = /^(blob:|https?:)/i;

export function openInNewTab(url) {
  if (typeof url !== "string" || !SAFE_SCHEME.test(url)) {
    console.warn("[openInNewTab] refused to open URL with disallowed scheme");
    return null;
  }
  return window.open(url, "_blank", "noopener,noreferrer");
}
