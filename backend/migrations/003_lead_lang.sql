-- Язык страницы, с которой пришла заявка (ru — /, ky — /ky/)
ALTER TABLE leads ADD COLUMN lang text NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru', 'ky'));
