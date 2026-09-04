-- Backfill: re-date payment journal entries to the invoice's issue date (accrual).
-- Dashboard/Laba Rugi group revenue by journal entry date; payments posted with
-- date = payment day (cash basis) misattributed August invoices paid in September.
-- Only payment JEs (referenceType = 'payment') get re-dated; isReversed rows keep
-- their own date (reversals stay in the reversal period).
UPDATE journal_entries je
SET date = i.issue_date
FROM invoices i
WHERE je.reference_type = 'payment'
  AND je.reference_id IS NOT NULL
  AND je.is_reversed = false
  AND je.reference_id = i.id
  AND je.date <> i.issue_date;