-- Campos de clasificacion para respuestas rapidas usadas por Patty.
ALTER TABLE IF EXISTS quick_replies
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS available_for_patty BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS quick_reply_items
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS available_for_patty BOOLEAN DEFAULT false;
