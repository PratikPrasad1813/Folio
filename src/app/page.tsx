import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Sign-in is paused for the demo — the workspace opens straight away.
export default function HomePage() {
  redirect("/overview");
}
