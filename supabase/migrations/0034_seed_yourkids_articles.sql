-- 0034_seed_yourkids_articles.sql
--
-- These 8 YourKids.com articles were first added to the Forms & Documents
-- reference list, but that list has no "length"/medium field, so they never
-- showed up under the Article filter on Training & Resources -- only real
-- rows in shared_training_catalog do that. Moving them here instead, as
-- "Next steps (suggested)" so they're optional and never nag for a
-- completion date, with length set to "Article" so they group correctly.
--
-- Titles/summaries were inferred from each article's URL, not read in full
-- (this session can't reach yourkids.com) -- worth a skim to check they're
-- accurate before relying on them.
--
-- shared_training_catalog has no unique constraint on title, so this
-- guards against duplicating rows if run more than once.

insert into shared_training_catalog (group_key, group_label, title, url, length, description)
select v.group_key, v.group_label, v.title, v.url, v.length, v.description
from (
  values
    ('next', 'Next steps (suggested)', 'AI Chatbots and Teens',
      'https://yourkids.com/articles/ai-chatbots-and-teens', 'Article',
      'What''s worth knowing about teenagers using AI chatbots.'),
    ('next', 'Next steps (suggested)', 'Looksmaxxing: What Parents of Boys Should Know',
      'https://yourkids.com/articles/looksmaxxing-what-parents-of-boys-should-know', 'Article',
      'The online "looksmaxxing" appearance trend aimed at boys and teenage boys.'),
    ('next', 'Next steps (suggested)', 'Newborn SMA Screening in England',
      'https://yourkids.com/articles/newborn-sma-screening-england', 'Article',
      'Newborn screening for spinal muscular atrophy (SMA), now offered in England.'),
    ('next', 'Next steps (suggested)', 'Picky Eating Starts Before Birth',
      'https://yourkids.com/articles/picky-eating-starts-before-birth', 'Article',
      'What shapes picky eating in young children, including factors from before birth.'),
    ('next', 'Next steps (suggested)', 'Teens and Loneliness: How Parents Can Help',
      'https://yourkids.com/articles/teens-and-loneliness-how-parents-can-help', 'Article',
      'Recognising loneliness in teenagers and ways to support them.'),
    ('next', 'Next steps (suggested)', 'Toddler Tantrums: Why They Happen and How to Respond',
      'https://yourkids.com/articles/toddler-tantrums-why-they-happen-how-to-respond', 'Article',
      'Why toddlers have tantrums and practical ways to respond.'),
    ('next', 'Next steps (suggested)', 'Circle Time Games for Groups',
      'https://yourkids.com/articles/circle-time-games-for-groups', 'Article',
      'Group games for circle time -- useful for sibling or family group activities.'),
    ('next', 'Next steps (suggested)', 'Cooperative Games for Mixed Ages',
      'https://yourkids.com/articles/cooperative-games-for-mixed-ages', 'Article',
      'Non-competitive games that work across a mixed-age group of children.')
) as v(group_key, group_label, title, url, length, description)
where not exists (
  select 1 from shared_training_catalog t where t.title = v.title
);
