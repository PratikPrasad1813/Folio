import type { ReactNode } from "react";
import Workspace from "@/components/workspace";

// The workspace shell lives in a shared layout so it stays mounted while you
// move between views and projects — data loads once and UI state persists.
// Pages below only validate the URL; Workspace renders the matching view.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
