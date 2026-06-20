import { Megaphone, MousePointer2 } from "lucide-react";

/** Realistic, self-contained mockups of exactly where the ad renders. */
export function WhereAdShows() {
  return (
    <section className="border-y bg-muted/30">
      <div className="container py-20">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Exactly where your ad appears</h2>
          <p className="mt-3 text-muted-foreground">
            One line, bottom-right of the editor&apos;s status bar - the same strip that shows
            the branch and language. It never covers code or interrupts work.
          </p>
        </div>

        {/* Full editor window mock */}
        <div className="mx-auto max-w-4xl overflow-hidden rounded-xl border bg-[#1e1e1e] shadow-2xl">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-black/40 bg-[#323233] px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-xs text-zinc-400">extension.ts - my-project</span>
          </div>

          <div className="flex">
            {/* Activity bar */}
            <div className="hidden w-12 flex-col items-center gap-5 bg-[#333333] py-4 text-zinc-500 sm:flex">
              {["📄", "🔍", "⌥", "🧩", "⚙️"].map((g, i) => (
                <span key={i} className="text-sm opacity-70">{g}</span>
              ))}
            </div>
            {/* File tabs + code */}
            <div className="min-w-0 flex-1">
              <div className="flex border-b border-black/40 bg-[#252526] text-xs">
                <span className="border-r border-black/40 bg-[#1e1e1e] px-4 py-2 text-zinc-200">extension.ts</span>
                <span className="px-4 py-2 text-zinc-500">server.ts</span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-6 text-zinc-300">
{`import * as vscode from "vscode";

export function activate(ctx: vscode.ExtensionContext) {
  const bar = vscode.window.createStatusBarItem();
  bar.text = "Ready";
  bar.show();
}`}
              </pre>
            </div>
          </div>

          {/* Status bar - the ad slot */}
          <div className="flex items-center justify-between bg-[#007acc] px-3 py-1 font-mono text-[11px] text-white">
            <span className="flex items-center gap-3">
              <span>⎇ main</span><span>✓ 0 ⚠ 0</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1 rounded bg-black/15 px-1.5 py-0.5">
                <Megaphone className="h-3 w-3" /> Vercel - Deploy in seconds →
              </span>
              <span className="text-emerald-200">$0.04 cr</span>
              <span>TypeScript</span>
            </span>
          </div>
        </div>

        {/* Two supporting cards: hover tooltip + earnings */}
        <div className="mx-auto mt-6 grid max-w-4xl gap-6 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <MousePointer2 className="h-4 w-4 text-primary" /> On hover - your brand + logo
            </div>
            <div className="rounded-lg border bg-[#252526] p-3 text-zinc-200 shadow-inner">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-white text-xs font-bold text-black">▲</span>
                <div className="text-xs">
                  <div className="font-semibold">Sponsored · Vercel</div>
                  <div className="text-zinc-400">Ship frontend apps with zero config.</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">↗ Click to open · earns you credits</div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 text-sm font-medium">What the developer sees</div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3">
              <div>
                <div className="text-xs text-muted-foreground">Today</div>
                <div className="text-sm">23 impressions · 2 clicks</div>
              </div>
              <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">+0.18 cr</div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Credits accrue passively and redeem for OpenRouter AI tokens.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
