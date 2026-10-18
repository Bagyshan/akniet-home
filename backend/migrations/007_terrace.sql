-- Терраса: своя цена за м² (вкладка «Основное», ключ price_terrace_m2), площадь террасы в заявке и в проекте.
ALTER TABLE leads ADD COLUMN terrace integer;

-- Демо-проекты получают террасу: площадь и зону на схеме 1 этажа (комната с "terrace": true). Проекты, которые уже меняли в админке (updated_by задан), не трогаем.
UPDATE projects SET data = jsonb_set(jsonb_set(data, '{terrace}', '12'), '{plan,0,rooms}', (data #> '{plan,0,rooms}') || '[{"x": 0, "y": 5.5, "w": 6, "h": 2, "name": "Терраса", "name_ky": "Терраса", "terrace": true}]'::jsonb)
  WHERE data->>'slug' = 'tau' AND NOT data ? 'terrace' AND updated_by IS NULL;
UPDATE projects SET data = jsonb_set(jsonb_set(data, '{terrace}', '17.5'), '{plan,0,rooms}', (data #> '{plan,0,rooms}') || '[{"x": 0, "y": 7, "w": 7, "h": 2.5, "name": "Терраса", "name_ky": "Терраса", "terrace": true}]'::jsonb)
  WHERE data->>'slug' = 'karagay' AND NOT data ? 'terrace' AND updated_by IS NULL;
UPDATE projects SET data = jsonb_set(jsonb_set(data, '{terrace}', '15'), '{plan,0,rooms}', (data #> '{plan,0,rooms}') || '[{"x": 0, "y": 7.2, "w": 6, "h": 2.5, "name": "Терраса", "name_ky": "Терраса", "terrace": true}]'::jsonb)
  WHERE data->>'slug' = 'jailoo' AND NOT data ? 'terrace' AND updated_by IS NULL;
UPDATE projects SET data = jsonb_set(jsonb_set(data, '{terrace}', '18'), '{plan,0,rooms}', (data #> '{plan,0,rooms}') || '[{"x": 0, "y": 7, "w": 6, "h": 3, "name": "Терраса", "name_ky": "Терраса", "terrace": true}]'::jsonb)
  WHERE data->>'slug' = 'alatoo' AND NOT data ? 'terrace' AND updated_by IS NULL;

-- Вопрос о террасе — вторым, после вопроса о цене дома. Пока цена террасы не задана, сайт его не показывает.
UPDATE faq SET position = position + 1 WHERE position >= 1;
INSERT INTO faq (position, data) VALUES (1, '{"q": "Сколько стоит терраса?", "q_ky": "Терраса канча турат?", "a": "Терраса считается отдельно от дома — {terrace_price} за м². В цену входят фундамент и металлический каркас, настил из террасной доски, ограждение со ступенями и крыша над террасой. Площадь террасы можно добавить в калькуляторе.", "a_ky": "Терраса үйдөн өзүнчө эсептелет — 1 м² үчүн {terrace_price}. Баага пайдубал жана металл каркас, террасалык тактайдан төшөм, тосмо менен тепкичтер жана террасанын үстүндөгү чатыр кирет. Террасанын аянтын эсептегичке кошсо болот."}');
