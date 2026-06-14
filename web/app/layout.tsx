import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeSlot — Reach developers where they code",
  description:
    "CodeSlot puts a single, unobtrusive sponsored slot in the VS Code status bar. Developers earn AI credits; advertisers reach an engaged technical audience.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
