import { notFound } from "next/navigation";
import { getPickupZone } from "@/lib/queries/pickup";
import { savePickupZoneAction } from "../actions";
import { PickupZoneFields } from "../PickupZoneFields";

export default async function EditPickupZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const zone = await getPickupZone(id);
  if (!zone) notFound();

  const saveWithId = savePickupZoneAction.bind(null, id);

  return (
    <div>
      <div className="pr-dash-head">
        <h1>{zone.name}</h1>
      </div>
      <form action={saveWithId} className="pr-dash-form">
        <PickupZoneFields zone={zone} />
        <div className="pr-dash-actions">
          <button type="submit" className="pr-dash-btn">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
