import type { PickupZoneRow } from "@/lib/queries/pickup";

/**
 * Shared field set for the new/edit pickup zone forms. Server component --
 * no client state needed (no delete: zones are deactivated, never deleted,
 * because historical bookings reference them).
 */
export function PickupZoneFields({ zone }: { zone: PickupZoneRow | null }) {
  return (
    <div className="pr-dash-card">
      <div className="pr-dash-form">
        <label className="pr-dash-field">
          Name
          <input name="name" defaultValue={zone?.name ?? ""} required placeholder="e.g. Kata / Karon" />
        </label>
        <label className="pr-dash-field">
          Transfer fee (THB, per booking)
          <input type="number" step="1" min="0" name="fee" defaultValue={zone?.fee ?? 0} required />
          <span className="pr-dash-field-hint">0 = free pickup. This is added to the booking total.</span>
        </label>
        <label className="pr-dash-field">
          Earliest pickup time
          <input name="earliest_pickup_time" defaultValue={zone?.earliest_pickup_time ?? ""} placeholder="07:30" />
          <span className="pr-dash-field-hint">24-hour time, or blank if it doesn&apos;t apply.</span>
        </label>
        <label className="pr-dash-field">
          Sort order
          <input type="number" step="1" min="0" name="sort_order" defaultValue={zone?.sort_order ?? 0} />
          <span className="pr-dash-field-hint">Lower numbers show first in the booking form.</span>
        </label>
        <label className="pr-dash-check">
          <input type="checkbox" name="is_active" defaultChecked={zone ? zone.is_active === 1 : true} /> Active (bookable)
        </label>
      </div>
    </div>
  );
}
