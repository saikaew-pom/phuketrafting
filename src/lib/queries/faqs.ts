import { getDb } from "@/lib/db";

/** Landing-page FAQ rows (migration 0017), read by the public section AND the FAQPage JSON-LD. */
export interface Faq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: number;
}

/** Active FAQs in display order -- the public site. */
export async function listActiveFaqs(): Promise<Faq[]> {
  const { results } = await getDb()
    .prepare("SELECT id, question, answer, sort_order, is_active FROM faqs WHERE is_active = 1 ORDER BY sort_order, created_at")
    .all<Faq>();
  return results;
}

/** All FAQs (active + hidden) for the dashboard. */
export async function listAllFaqs(): Promise<Faq[]> {
  const { results } = await getDb()
    .prepare("SELECT id, question, answer, sort_order, is_active FROM faqs ORDER BY sort_order, created_at")
    .all<Faq>();
  return results;
}

/** Appends at the end (guarded MAX+1 sort_order, same no-race pattern as product_images). */
export async function createFaq(question: string, answer: string): Promise<void> {
  const id = `faq-${crypto.randomUUID().slice(0, 12)}`;
  await getDb()
    .prepare(
      `INSERT INTO faqs (id, question, answer, sort_order)
       SELECT ?1, ?2, ?3, COALESCE(MAX(sort_order), -1) + 1 FROM faqs`
    )
    .bind(id, question, answer)
    .run();
}

export async function updateFaq(id: string, question: string, answer: string, isActive: boolean): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE faqs SET question = ?1, answer = ?2, is_active = ?3, updated_at = unixepoch() WHERE id = ?4")
    .bind(question, answer, isActive ? 1 : 0, id)
    .run();
  return result.meta.changes > 0;
}

export async function deleteFaq(id: string): Promise<boolean> {
  const result = await getDb().prepare("DELETE FROM faqs WHERE id = ?1").bind(id).run();
  return result.meta.changes > 0;
}

/** Swaps sort_order with the adjacent FAQ, atomically (db.batch). */
export async function moveFaq(id: string, direction: "up" | "down"): Promise<void> {
  const db = getDb();
  const row = await db.prepare("SELECT sort_order FROM faqs WHERE id = ?1").bind(id).first<{ sort_order: number }>();
  if (!row) return;
  const cmp = direction === "up" ? "<" : ">";
  const order = direction === "up" ? "DESC" : "ASC";
  const neighbour = await db
    .prepare(`SELECT id, sort_order FROM faqs WHERE sort_order ${cmp} ?1 ORDER BY sort_order ${order} LIMIT 1`)
    .bind(row.sort_order)
    .first<{ id: string; sort_order: number }>();
  if (!neighbour) return;
  await db.batch([
    db.prepare("UPDATE faqs SET sort_order = ?1 WHERE id = ?2").bind(neighbour.sort_order, id),
    db.prepare("UPDATE faqs SET sort_order = ?1 WHERE id = ?2").bind(row.sort_order, neighbour.id),
  ]);
}
