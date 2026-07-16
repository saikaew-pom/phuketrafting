"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/access";
import { createPickupZone, updatePickupZone, type PickupZoneInput } from "@/lib/queries/pickup";

function readInput(formData: FormData): PickupZoneInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");

  // fee is REAL in the schema (THB, no satang in practice) -- accept decimals
  // but reject nonsense. It's money a guest is charged, so no silent defaults.
  // The emptiness check is NOT redundant with Number.isFinite: Number("") and
  // Number("   ") are both 0, not NaN, so a blank/whitespace fee would sail
  // through as a legitimate "free pickup" instead of being rejected -- the one
  // silent default this comment says must not exist. The `required` attribute
  // on the input is client-side only; a Server Action is reachable by direct
  // POST, so the guard has to live here.
  const rawFee = String(formData.get("fee") ?? "").trim();
  if (!rawFee) throw new Error("Transfer fee is required (enter 0 for free pickup).");
  const fee = Number(rawFee);
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Invalid transfer fee.");

  const sort_order = Number(String(formData.get("sort_order") ?? "0").trim() || "0");
  if (!Number.isInteger(sort_order) || sort_order < 0) throw new Error("Invalid sort order.");

  // Shape AND range. `^\d{2}:\d{2}$` only checked the shape, so "99:99",
  // "24:00" and "19:60" all passed -- and nothing downstream ever parses this
  // string back into a time, it is echoed verbatim to guests (the pickup line
  // in booking/reminder emails, via notifications.ts's pickup_earliest_time)
  // and into the chatbot's grounding prompt. A typo'd "19:60" would therefore
  // be quoted to a guest as a real pickup time with nothing to catch it.
  const time = String(formData.get("earliest_pickup_time") ?? "").trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Earliest pickup time must be a real 24-hour time like 07:30 (or be left blank).");
  }

  return {
    name,
    fee,
    earliest_pickup_time: time,
    is_active: formData.get("is_active") === "on",
    sort_order,
  };
}

export async function createPickupZoneAction(formData: FormData): Promise<void> {
  await requireStaff();
  await createPickupZone(readInput(formData));
  revalidatePath("/dashboard/pickup");
  redirect("/dashboard/pickup");
}

export async function savePickupZoneAction(zoneId: string, formData: FormData): Promise<void> {
  await requireStaff();
  const ok = await updatePickupZone(zoneId, readInput(formData));
  if (!ok) throw new Error("That pickup zone no longer exists.");
  revalidatePath("/dashboard/pickup");
  revalidatePath(`/dashboard/pickup/${zoneId}`);
}
