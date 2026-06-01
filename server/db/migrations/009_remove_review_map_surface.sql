update compiled_notes
set note_type = 'knowledge_note',
    updated_at = now()
where note_type = 'review_map';

update knowledge_sources
set knowledge_type = 'knowledge_note',
    updated_at = now()
where knowledge_type = 'review_map';

update update_proposals
set detected_knowledge_type = 'knowledge_note'
where detected_knowledge_type = 'review_map';

delete from note_card_positions
where board_key = 'review-maps';
