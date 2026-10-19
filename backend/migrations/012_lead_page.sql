-- Откуда пришла заявка: адрес страницы (/projects/, /ky/invest/ …) и форма — основная, квиз или «каталог в WhatsApp»
ALTER TABLE leads ADD COLUMN page text, ADD COLUMN source text CHECK (source IN ('form', 'quiz', 'catalog'));
