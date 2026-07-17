// Gate test for migration 0016 (product_images) and lib/queries/images.ts's
// SQL semantics (F4). Exercises the REAL local D1 via wrangler, not a mock:
// asserts the table/index exist, that append gives incrementing sort_order,
// that the gallery (owner_id NULL) and a product's images select separately,
// that the up/down swap reorders, and that delete removes exactly one row.
//
// Run:  node scripts/verify-migration-0016.mjs
// Exits non-zero on any failed assertion. Cleans up its own ZZ- rows.
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--local", "--json", "--command", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  return JSON.parse(out)[0]?.results ?? [];
}

let failures = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? "ok" : "FAIL"}: ${msg}`);
  if (!cond) failures++;
}

// Mirrors addImage()'s guarded append: sort_order = MAX(existing for owner)+1.
function append(id, ownerType, ownerIdSql, imageId, label) {
  d1(
    `INSERT INTO product_images (id, owner_type, owner_id, image_id, label, sort_order)
     SELECT '${id}', '${ownerType}', ${ownerIdSql}, '${imageId}', '${label}',
            COALESCE(MAX(sort_order), -1) + 1
       FROM product_images
      WHERE owner_type = '${ownerType}'
        AND (owner_id = ${ownerIdSql} OR (${ownerIdSql} IS NULL AND owner_id IS NULL))`
  );
}

try {
  console.log("1. Table + index exist");
  const tbl = d1("SELECT name FROM sqlite_master WHERE type='table' AND name='product_images'");
  assert(tbl.length === 1, "product_images table present");
  const idx = d1("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_product_images_owner'");
  assert(idx.length === 1, "idx_product_images_owner present");

  console.log("2. Append assigns incrementing sort_order per owner");
  append("ZZ-g1", "gallery", "NULL", "cid-g1", "First");
  append("ZZ-g2", "gallery", "NULL", "cid-g2", "Second");
  append("ZZ-t1", "tour", "'ZZ-tour'", "cid-t1", "Tour one");
  const gallery = d1("SELECT id, sort_order FROM product_images WHERE owner_type='gallery' AND owner_id IS NULL AND id LIKE 'ZZ-%' ORDER BY sort_order");
  assert(gallery.length === 2 && gallery[0].sort_order === 0 && gallery[1].sort_order === 1, "gallery images get sort_order 0,1");

  console.log("3. Gallery (NULL owner) and product images select separately");
  const tourImgs = d1("SELECT id FROM product_images WHERE owner_type='tour' AND owner_id='ZZ-tour'");
  assert(tourImgs.length === 1 && tourImgs[0].id === "ZZ-t1", "tour owner returns only its own image, not the gallery");
  const tStart = d1("SELECT sort_order FROM product_images WHERE id='ZZ-t1'");
  assert(tStart[0].sort_order === 0, "first image of a NEW owner starts at 0 (not continuing the gallery's counter)");

  console.log("4. Swap (move down) reorders");
  // Mirror moveImage('ZZ-g1','down'): swap with the next-higher neighbour.
  d1("UPDATE product_images SET sort_order = 1 WHERE id='ZZ-g1'; UPDATE product_images SET sort_order = 0 WHERE id='ZZ-g2';");
  const afterSwap = d1("SELECT id FROM product_images WHERE owner_type='gallery' AND owner_id IS NULL AND id LIKE 'ZZ-%' ORDER BY sort_order");
  assert(afterSwap[0].id === "ZZ-g2" && afterSwap[1].id === "ZZ-g1", "after swap, order is g2 then g1");

  console.log("5. Delete removes exactly one");
  d1("DELETE FROM product_images WHERE id='ZZ-g1'");
  const remaining = d1("SELECT COUNT(*) AS n FROM product_images WHERE id LIKE 'ZZ-%'");
  assert(remaining[0].n === 2, "one deleted, two remain");
} finally {
  d1("DELETE FROM product_images WHERE id LIKE 'ZZ-%' OR owner_id='ZZ-tour'");
  console.log("cleanup: ZZ- rows removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll product_images gate-test assertions passed.");
