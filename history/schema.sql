CREATE TABLE training_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  week_end   TEXT NOT NULL,
  filename   TEXT NOT NULL,
  push_level TEXT,
  pull_level TEXT,
  focus      TEXT,
  summary    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE exercise_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id  INTEGER REFERENCES training_weeks(id),
  date     TEXT,
  window   TEXT,   -- утро / день / вечер / перед сном
  block    TEXT,   -- push / pull / mob
  exercise TEXT,
  planned  TEXT,   -- "3×6 от стены"
  done     INTEGER,-- 1 / 0 / NULL
  felt     TEXT,   -- rpe или словом
  note     TEXT,
  liked    INTEGER -- 1 / 0 / NULL
);

CREATE TABLE progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT DEFAULT (datetime('now')),
  metric TEXT NOT NULL,  -- max_pushup_wall, max_pushup_knee, max_hang_sec, max_active_hang_sec, max_negative_sec, max_band_pullup
  value  REAL NOT NULL,
  note   TEXT
);

CREATE TABLE training_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,            -- exercise / cue / body_part
  name     TEXT NOT NULL,
  rating   INTEGER NOT NULL,-- -2 стоп/боль, -1 временно убрать, +1 норм, +2 чаще
  note     TEXT,
  valid_until TEXT,
  source   TEXT,            -- user / coach
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
