-- Persist the per-item eval warnings (grounding failure reasons) on the proposal
-- item so the Review Queue can show *why* an item failed/warned, instead of a
-- generic acknowledgement message.
alter table proposal_items add column if not exists eval_warnings jsonb;
