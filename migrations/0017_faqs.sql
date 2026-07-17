-- Migration number: 0017 	 2026-07-17T09:00:00.000Z

-- The landing-page FAQ (plan §3: staff-editable content), moved out of the
-- hardcoded FAQS array in lib/content.ts. The public FAQ section AND the
-- FAQPage JSON-LD both read these rows, so the structured data can never drift
-- from what's shown -- the same "one source" property the blog FAQ parsing has.
-- (Blog posts keep their own per-post ## FAQ parsing; this is only the landing
-- page's.)
CREATE TABLE faqs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;

-- Seed the existing six so the CMS is populated and the public page is
-- unchanged the instant this lands (apostrophes doubled per SQL string rules).
INSERT INTO faqs (id, question, answer, sort_order) VALUES
  ('faq-experience', 'Do I need experience to go rafting?', 'Not at all. Every trip starts with a safety briefing in English and a certified guide rides with each raft. Beginners and families are welcome.', 0),
  ('faq-safety', 'Is it safe for kids and older travelers?', 'Yes. We''ve safely guided families for 20+ years. The Classic Rush and Adventure Combo suit most ages -- message us your group''s ages and we''ll recommend the right package.', 1),
  ('faq-pickup', 'How do I get there? Is pickup included?', 'We arrange transfers from Phuket and the surrounding areas. Tell us your hotel on WhatsApp and we''ll confirm pickup times and any transfer cost.', 2),
  ('faq-bring', 'What should I bring?', 'Just swimwear, a change of clothes and a sense of adventure. We provide all safety gear, and there are hot showers, lockers and changing rooms on site.', 3),
  ('faq-pay', 'How do I pay?', 'Book online and pay a 25% deposit to lock in your date -- the rest is due on the day of your adventure. Cancel or reschedule free up to 72 hours before departure and the deposit is refunded in full. Prefer to talk first? Message us on WhatsApp.', 4),
  ('faq-rain', 'What if it rains?', 'Rafting runs in most weather -- rain often makes the river even better! In the rare case of unsafe conditions we''ll reschedule or refund you in full.', 5);
