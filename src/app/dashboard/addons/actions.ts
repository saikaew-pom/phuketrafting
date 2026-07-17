"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { createAddon, updateAddon, deleteAddon, moveAddon } from "@/lib/queries/addons";

function revalidateAddons(): void {
  revalidatePath("/dashboard/addons");
  // Add-ons show as tick-boxes in the public booking widget, so the catalog
  // change must reach the public tour/camp pages too.
  revalidatePath("/[lang]", "page");
}

/**
 * A blank or non-numeric price would coerce to 0 (Number("") === 0) and quietly
 * make the add-on FREE -- the same money trap the tour rate editor guards. A
 * price is money, so reject rather than default. (See createAddon's own
 * negative-price guard for the belt-and-suspenders layer.)
 */
function parsePrice(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function addAddon(formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const price = parsePrice(formData.get("price"));

  const fail = (c: string) => redirect(`/dashboard/addons?error=${c}`);
  if (!name) fail("name_required");
  if (price === null) fail("bad_price");

  await createAddon(name, description, price!);
  revalidateAddons();
  redirect("/dashboard/addons?saved=1");
}

export async function saveAddon(id: string, formData: FormData): Promise<void> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const price = parsePrice(formData.get("price"));
  const isActive = formData.get("is_active") === "on";

  const fail = (c: string) => redirect(`/dashboard/addons?error=${c}`);
  if (!name) fail("name_required");
  if (price === null) fail("bad_price");

  await updateAddon(id, name, description, price!, isActive);
  revalidateAddons();
  redirect("/dashboard/addons?saved=1");
}

export async function removeAddon(id: string): Promise<void> {
  await requireStaff();
  const deleted = await deleteAddon(id);
  revalidateAddons();
  // An add-on a booking already bought can't be hard-deleted (its addon_id FK
  // is referenced by booking_addons) -- tell staff to untick Active instead of
  // silently no-op'ing.
  redirect(deleted ? "/dashboard/addons?saved=1" : "/dashboard/addons?error=has_bookings");
}

export async function moveAddonAction(id: string, direction: "up" | "down"): Promise<void> {
  await requireStaff();
  await moveAddon(id, direction);
  revalidateAddons();
}
