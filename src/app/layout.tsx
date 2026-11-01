import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
// Generated dark layer first: each rule still beats its own light rule (+1 attribute),
// while specificity ties resolve in favour of the hand-written legacy rules.
import "./theme-dark.generated.css";
import "./globals.css";
import "./polish.css";
import "./dashboard.css";
import "./projects.css";
import "./tasks.css";
import "./theme.css";

export const metadata: Metadata = {
  title: "folio — A little clarity. A lot of possibility.",
  description: "A thoughtful personal workspace for your projects, tasks, and next big ideas. A little more organized. A little more you.",
  applicationName: "folio",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f13" },
  ],
};

// Runs before first paint: saved preference first, then the OS setting.
const themeBootScript = `(function(){try{var s=localStorage.getItem("folio-theme");var t=s==="dark"||s==="light"?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
