-- 0035_yourkids_platform.sql
--
-- The 8 YourKids articles seeded in 0034 showed "Article" but not where
-- they actually come from. Setting platform so each shows "YourKids ·
-- Article" on Training & Resources, same as any other course shows its
-- platform.

update shared_training_catalog
set platform = 'YourKids'
where title in (
  'AI Chatbots and Teens',
  'Looksmaxxing: What Parents of Boys Should Know',
  'Newborn SMA Screening in England',
  'Picky Eating Starts Before Birth',
  'Teens and Loneliness: How Parents Can Help',
  'Toddler Tantrums: Why They Happen and How to Respond',
  'Circle Time Games for Groups',
  'Cooperative Games for Mixed Ages'
)
and platform = '';
