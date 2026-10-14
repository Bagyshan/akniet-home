-- Заявки с сайта
CREATE TABLE leads (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  name          text NOT NULL,
  phone         text NOT NULL,
  house_type    text,
  contact_via   text,
  project       text,
  area          integer,
  message       text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_work', 'done', 'spam')),
  telegram_sent boolean NOT NULL DEFAULT false
);
CREATE INDEX leads_created_at_idx ON leads (created_at DESC);

-- Редактируемый контент сайта: ключ → значение (список ключей — src/content.ts)
CREATE TABLE content (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
