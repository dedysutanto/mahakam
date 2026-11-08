-- Satuan on purchase items, mirroring InvoiceItem.unit so the purchase form can
-- offer the same vocabulary the invoice form already uses. Existing rows are
-- backfilled from their product, falling back to the column default.
ALTER TABLE "purchase_items" ADD COLUMN "unit" VARCHAR(20) NOT NULL DEFAULT 'pcs';

UPDATE "purchase_items" pi
SET "unit" = COALESCE(NULLIF(p."unit", ''), 'pcs')
FROM "products" p
WHERE pi."productId" = p."id";
