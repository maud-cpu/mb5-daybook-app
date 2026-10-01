-- Carer-level annual review tracking: the date of the carer's own
-- approval review, and a requirements checklist to work through ahead of
-- it (home insurance confirmation, DBS renewal, etc). One row per carer,
-- same as the rest of the household table.
alter table household add column if not exists annual_review_date date;
alter table household add column if not exists annual_review_checklist jsonb not null default '[
  {"text": "Annual Review Report / your own comments", "done": false},
  {"text": "Supervising social worker''s review report received", "done": false},
  {"text": "Home & contents / public liability insurance confirmation", "done": false},
  {"text": "Safer Care Policy reviewed and up to date", "done": false},
  {"text": "Personal Development Plan reviewed", "done": false},
  {"text": "DBS check renewed (every 3 years)", "done": false},
  {"text": "Carer medical certificate (every 2 years)", "done": false},
  {"text": "Health & safety check completed", "done": false},
  {"text": "Pet assessment, if applicable", "done": false}
]'::jsonb;
