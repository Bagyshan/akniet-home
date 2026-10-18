-- Примеры домов клиентов, которые сдаются посуточно (страница «Под аренду», /invest/). Редактируются в админке.
-- data: title / title_ky, place / place_ky, area, project (id проекта), price_night ($ за сутки), nights (ночей в год), invest (вложения, $),
-- story / story_ky, image. Пока записей нет — блок на сайте скрыт. Начальных записей нет: на сайте только реальные цифры.
CREATE TABLE rentals (
  id         serial PRIMARY KEY,
  position   integer NOT NULL DEFAULT 0,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
