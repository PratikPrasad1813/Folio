import { notFound } from "next/navigation";

const VIEWS = ["overview", "projects", "tasks", "ideas", "calendar", "settings"];

// Only the known views exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return VIEWS.map((view) => ({ view }));
}

// Sign-in is paused for the demo, so the workspace renders for everyone.
// The UI itself is rendered by the (workspace) layout.
export default async function WorkspaceViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!VIEWS.includes(view)) notFound();
  return null;
}
