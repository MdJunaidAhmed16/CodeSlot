import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeSlot - Reach developers where they code",
  description:
    "CodeSlot puts a single, unobtrusive sponsored slot in the VS Code status bar. Developers earn AI credits; advertisers reach an engaged technical audience.",
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `(function(){try{if(localStorage.getItem('codeslot-theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
