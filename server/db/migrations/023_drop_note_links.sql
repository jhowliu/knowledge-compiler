-- Notes are no longer linked into a graph. Drop the link and card-position
-- tables, and the proposal items / agent runs that only existed to feed them.
delete from proposal_items where action_type = 'create_link';
delete from agent_runs where run_type = 'reindex_links';
delete from agent_run_events where category = 'linking';

drop table if exists note_card_positions;
drop table if exists note_links;
