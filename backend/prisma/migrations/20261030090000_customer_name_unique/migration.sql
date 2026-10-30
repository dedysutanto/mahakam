-- Case- and whitespace-insensitive uniqueness of a contact name per tenant and
-- type. The expense form offers "buat vendor baru" beside the existing list, so
-- the same vendor name arrives repeatedly; the route returns the existing row
-- instead of inserting (V69), and this index is what makes that safe under
-- concurrent submits -- two requests can both pass the lookup.
CREATE UNIQUE INDEX "customers_tenant_type_name_key"
  ON "customers" ("tenantId", "type", lower(btrim("name")));
