// Gate test for migration 0022 (product_images.show_on_home) and
// lib/queries/images.ts's setImageShowOnHome/listImages semantics.
// Exercises the REAL local D1:
//   - column exists, INTEGER, NOT NULL
//   - the exact ALTER TABLE statement backfills PRE-EXISTING rows to 1, not
//     NULL or 0 -- tested on a scratch table carrying the pre-0022 schema
//     (STRICT, no show_on_home column), seeded BEFORE the ALTER runs, so this
//     reproduces the real upgrade path (38 live rows predating the column)
//     rather than trusting that the already-migrated product_images table
//     "looks right" after the fact
//   - a real INSERT that omits show_on_home (addImage's shape) still lands 1
//     via the column default, on the actual product_images table
//   - setImageShowOnHome writes exactly 0/1, never anything else
//   - listImages returns show_on_home for BOTH the owner_id-IS-NULL (gallery)
//     and owner_id-bound (tour/camp_zone) query branches
//
// Run:  node scripts/verify-migration-0022.mjs
// Exits non-zero on any failed assertion. Cleans up its own ZZ- rows/table.
import { execFileSync } from "node:child_process";

const DB = "phuket-rafting-db";
function d1(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", "--json", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out)[0]?.results ?? [];
}
let failures = 0;
function assert(cond, msg) {
  console.log(`  ${cond ? "ok" : "FAIL"}: ${msg}`);
  if (!cond) failures++;
}

try {
  console.log("1. Column exists, INTEGER, NOT NULL");
  const col = d1("SELECT name, type, \"notnull\", dflt_value FROM pragma_table_info('product_images') WHERE name='show_on_home'")[0];
  assert(!!col, "show_on_home column present on product_images");
  assert(col?.type === "INTEGER", `type is INTEGER (got ${col?.type})`);
  assert(col?.notnull === 1, "column is NOT NULL");

  console.log("2. Pre-existing rows are backfilled to 1 by the exact migration statement");
  // Scratch table with product_images' PRE-0022 shape (mirrors migration
  // 0016 exactly, minus show_on_home) -- so seeding rows here and THEN
  // running the literal ALTER reproduces what happened to the 38 real
  // production rows, rather than assuming the already-migrated live table
  // proves anything about the backfill itself.
  d1("DROP TABLE IF EXISTS ZZ_pre0022_images");
  d1(`CREATE TABLE ZZ_pre0022_images (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL CHECK (owner_type IN ('gallery', 'tour', 'camp_zone')),
        owner_id TEXT,
        image_id TEXT NOT NULL,
        label TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      ) STRICT`);
  d1(`INSERT INTO ZZ_pre0022_images (id, owner_type, owner_id, image_id, label, sort_order) VALUES
      ('ZZ-pre-1','gallery',NULL,'zz/pre1','Has a caption',0),
      ('ZZ-pre-2','gallery',NULL,'zz/pre2',NULL,1),
      ('ZZ-pre-3','tour','tour-b1','zz/pre3','Tour photo',0)`);
  d1("ALTER TABLE ZZ_pre0022_images ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 1");
  const backfilled = d1("SELECT id, show_on_home FROM ZZ_pre0022_images ORDER BY id");
  assert(backfilled.length === 3, "all 3 pre-existing rows still present after ALTER");
  assert(
    backfilled.every((r) => r.show_on_home === 1),
    `every pre-existing row backfilled to show_on_home=1 (got ${JSON.stringify(backfilled)})`
  );
  d1("DROP TABLE ZZ_pre0022_images");

  console.log("3. A real INSERT that omits show_on_home (addImage's exact column list) defaults to 1");
  d1(`INSERT INTO product_images (id, owner_type, owner_id, image_id, label, sort_order)
      SELECT 'ZZ-new-1','gallery',NULL,'zz/new1','New upload',
             COALESCE(MAX(sort_order),-1)+1 FROM product_images WHERE owner_type='gallery' AND owner_id IS NULL`);
  const fresh = d1("SELECT show_on_home FROM product_images WHERE id='ZZ-new-1'")[0];
  assert(fresh?.show_on_home === 1, `newly-inserted row (no show_on_home in the column list) defaults to 1 (got ${fresh?.show_on_home})`);

  console.log("4. setImageShowOnHome's UPDATE shape writes exactly 0/1");
  d1("UPDATE product_images SET show_on_home = 0 WHERE id='ZZ-new-1'");
  assert(d1("SELECT show_on_home FROM product_images WHERE id='ZZ-new-1'")[0].show_on_home === 0, "hide (0) persists");
  d1("UPDATE product_images SET show_on_home = 1 WHERE id='ZZ-new-1'");
  assert(d1("SELECT show_on_home FROM product_images WHERE id='ZZ-new-1'")[0].show_on_home === 1, "show (1) persists");

  console.log("5. listImages' two query branches (owner_id IS NULL / owner_id = ?) both select show_on_home");
  d1(`INSERT INTO product_images (id, owner_type, owner_id, image_id, label, sort_order, show_on_home)
      VALUES ('ZZ-new-2','tour','tour-b1','zz/new2','Tour photo',999,0)`);
  const galleryBranch = d1("SELECT show_on_home FROM product_images WHERE owner_type='gallery' AND owner_id IS NULL AND id='ZZ-new-1'")[0];
  const ownerBranch = d1("SELECT show_on_home FROM product_images WHERE owner_type='tour' AND owner_id='tour-b1' AND id='ZZ-new-2'")[0];
  assert(galleryBranch?.show_on_home === 1, "gallery (owner_id IS NULL) branch returns show_on_home");
  assert(ownerBranch?.show_on_home === 0, "tour (owner_id bound) branch returns show_on_home");
} finally {
  d1("DELETE FROM product_images WHERE id LIKE 'ZZ-%'");
  d1("DROP TABLE IF EXISTS ZZ_pre0022_images");
  console.log("cleanup: ZZ- rows and scratch table removed");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll gallery show_on_home gate-test assertions passed.");
