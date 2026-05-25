create table if not exists note_card_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  board_key text not null default 'default',
  note_id uuid not null references compiled_notes(id) on delete cascade,
  x_position numeric(6, 3) not null,
  y_position numeric(6, 3) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_key, note_id)
);

create index if not exists note_card_positions_board_idx
  on note_card_positions (board_key, updated_at desc);
