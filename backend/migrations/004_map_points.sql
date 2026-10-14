-- Точки на карте «Строим по всему Кыргызстану»: населённый пункт и что там построено. Заполняются вручную в админке.
CREATE TABLE map_points (
  id         serial PRIMARY KEY,
  lat        double precision NOT NULL CHECK (lat BETWEEN 39 AND 43.6),
  lon        double precision NOT NULL CHECK (lon BETWEEN 69 AND 80.6),
  name       text NOT NULL,
  name_ky    text,
  houses     integer NOT NULL DEFAULT 0 CHECK (houses >= 0),
  area       numeric(10, 1) NOT NULL DEFAULT 0 CHECK (area >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
