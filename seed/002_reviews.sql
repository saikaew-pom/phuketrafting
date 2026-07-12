-- Real review content from data.jsx's REVIEWS array (the current live-site
-- copy). One review references "Riverside Camping" -- not a `tours` row
-- (camping is a separate product line), so tour_id is left NULL for it.

INSERT INTO reviews (guest_name, guest_place, rating, content, tour_id, is_published, sort_order) VALUES
('Richard', 'Singapore', 5, 'I''ve travelled to Phuket many times -- I wish I''d discovered Le Rafting & ATV sooner. An amazing new experience for me and my family.', 'tour-b3', 1, 1),
('Hannah', 'United Kingdom', 5, 'Best day of our trip, hands down. The guides were hilarious and made us feel safe the whole time. Hot showers after were a lifesaver!', 'tour-b1', 1, 2),
('Marco', 'Italy', 5, 'Super organized from pickup to drop-off. The rapids were a proper rush and the zipline through the jungle was unreal. Worth every baht.', 'tour-b2', 1, 3),
('Aisyah', 'Malaysia', 5, 'Took my parents and my kids -- something for everyone. Clean, professional and genuinely fun. Booking on WhatsApp was so easy.', 'tour-b2', 1, 4),
('Tom & Lena', 'Germany', 5, 'We added the riverside camping and it was magical. Falling asleep to the river after a day of rafting -- can''t recommend enough.', NULL, 1, 5),
('Daniel', 'Australia', 5, 'Did the full option with ATV. Muddy, wild and so much fun. Staff clearly know what they''re doing after 20+ years. Legends.', 'tour-b3', 1, 6);
