import { getDb } from "@/lib/db";

export interface PickupZone {
  id: string;
  name: string;
  fee: number;
  earliest_pickup_time: string | null;
}

export async function listPickupZones(): Promise<PickupZone[]> {
  const { results } = await getDb()
    .prepare("SELECT id, name, fee, earliest_pickup_time FROM pickup_zones WHERE is_active = 1 ORDER BY sort_order, name")
    .all<PickupZone>();
  return results;
}
