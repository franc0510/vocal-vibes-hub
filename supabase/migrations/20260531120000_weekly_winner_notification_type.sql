-- ============================================================
-- Add 'weekly_winner' notification type for "VocMe of the Week"
-- ============================================================

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'share', 'follow',
    'group_added', 'group_post', 'friend_post',
    'weekly_winner'
  ));
