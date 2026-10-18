-- Терраса двух видов: открытая и закрытая, у каждой своя цена за м² (price_terrace_open_m2 / price_terrace_closed_m2).
-- Единая цена price_terrace_m2 из 007 больше не используется.
DELETE FROM content WHERE key = 'price_terrace_m2';
-- начальные цены; пустое поле в админке — этот вид террасы на сайте не предлагается
INSERT INTO content (key, value, updated_by) VALUES ('price_terrace_open_m2', '300', 'migration'), ('price_terrace_closed_m2', '350', 'migration')
  ON CONFLICT (key) DO NOTHING;
ALTER TABLE leads ADD COLUMN terrace_type text CHECK (terrace_type IN ('open', 'closed'));

-- Тип террасы у проектов: демо-барнхаусы — с закрытой, остальные — с открытой
UPDATE projects SET data = data || jsonb_build_object('terrace_type', CASE WHEN updated_by IS NULL AND data->>'slug' IN ('jailoo', 'alatoo') THEN 'closed' ELSE 'open' END)
  WHERE NOT data ? 'terrace_type';

-- Вопрос о террасе: новый текст, если его не меняли в админке; иначе старая вставка становится ценой открытой террасы
UPDATE faq SET data = data || '{"a": "Терраса считается отдельно от дома: открытая — {terrace_open_price} за м², закрытая — {terrace_closed_price} за м². В цену входят фундамент и металлический каркас, настил из террасной доски, ограждение со ступенями и крыша, у закрытой террасы — ещё стены и остекление. Тип и площадь террасы можно выбрать в калькуляторе.", "a_ky": "Терраса үйдөн өзүнчө эсептелет: ачык терраса — 1 м² үчүн {terrace_open_price}, жабык терраса — 1 м² үчүн {terrace_closed_price}. Баага пайдубал жана металл каркас, террасалык тактайдан төшөм, тосмо менен тепкичтер жана чатыр кирет, жабык террасада — дагы дубалдар жана айнектер. Террасанын түрүн жана аянтын эсептегичте тандаса болот."}'::jsonb
  WHERE updated_by IS NULL AND data->>'a' LIKE '%{terrace_price}%';
UPDATE faq SET data = replace(data::text, '{terrace_price}', '{terrace_open_price}')::jsonb
  WHERE data::text LIKE '%{terrace_price}%';
