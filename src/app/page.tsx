import { redirect } from "next/navigation";
import { DEFAULT_LOCALE } from "@/lib/i18n";

// This is the only mechanism that redirects "/" -> "/en" -- the deleted
// middleware.ts (see src/lib/access.ts for why it's gone) only ever gated
// /dashboard/*, it never touched "/".
export default function RootPage() {
  redirect(`/${DEFAULT_LOCALE}`);
}
