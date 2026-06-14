import * as vscode from "vscode";
import { getNonce } from "../util/nonce";

/**
 * Builds the HTML shell for a webview with a strict, nonce-based
 * Content-Security-Policy.
 *
 * CSP rationale (SECURITY §3):
 *  - default-src 'none'  → deny everything by default
 *  - script-src nonce    → only our bundled, nonce-tagged script runs; no
 *                          inline handlers, no eval, no remote scripts
 *  - style-src cspSource  → only stylesheets shipped in the extension
 *  - img-src              → only extension assets + https (advertiser logos)
 *  - connect-src 'none'   → the webview itself makes NO network requests; all
 *                          backend traffic goes through the trusted ext host
 */
export function renderWebviewHtml(opts: {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  scriptFile: string;
  styleFile: string;
  title: string;
  bodyHtml: string;
}): string {
  const { webview, extensionUri } = opts;
  const nonce = getNonce();

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", opts.scriptFile)
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", opts.styleFile)
  );

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `connect-src 'none'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body>
${opts.bodyHtml}
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
