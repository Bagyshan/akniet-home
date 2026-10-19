-- Кнопки под заявкой в Telegram: какое сообщение обновлять, кто взял заявку (имя и id в Telegram) и когда сменился статус
ALTER TABLE leads ADD COLUMN tg_message_id bigint, ADD COLUMN taken_by text, ADD COLUMN taken_by_id bigint, ADD COLUMN status_at timestamptz;
