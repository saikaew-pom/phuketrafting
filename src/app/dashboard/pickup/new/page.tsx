import { createPickupZoneAction } from "../actions";
import { PickupZoneFields } from "../PickupZoneFields";

export default function NewPickupZonePage() {
  return (
    <div>
      <div className="pr-dash-head">
        <h1>New pickup zone</h1>
      </div>
      <form action={createPickupZoneAction} className="pr-dash-form">
        <PickupZoneFields zone={null} />
        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">
            Create zone
          </button>
        </div>
      </form>
    </div>
  );
}
