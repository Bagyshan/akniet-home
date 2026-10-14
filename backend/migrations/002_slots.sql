-- Пронумерованные ячейки: карточки материалов (1–10) и фото галереи (1–6).
-- Нет строки — на сайте стоковая карточка.
CREATE TABLE slots (
  section    text NOT NULL CHECK (section IN ('materials', 'gallery')),
  slot       integer NOT NULL CHECK (slot > 0),
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (section, slot)
);

-- текстовые сроки заменены числами (build_months_avg / build_months_min)
DELETE FROM content WHERE key IN ('build_time', 'build_time_min');
