-- Expand notification types to include follow, group_added, group_post, friend_post
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'share', 'follow', 'group_added', 'group_post', 'friend_post'));

-- Add optional group_id reference to notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Auto-create notification on follow
CREATE OR REPLACE FUNCTION public.handle_follow_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Notify the person being followed
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_create_notification ON public.follows;
CREATE TRIGGER on_follow_create_notification
  AFTER INSERT ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_follow_notification();

-- Auto-create notification when added to a group
CREATE OR REPLACE FUNCTION public.handle_group_member_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  group_owner UUID;
BEGIN
  -- Get the group owner
  SELECT owner_id INTO group_owner FROM public.groups WHERE id = NEW.group_id;
  -- Only notify if user was added by someone else (not self-joining as owner)
  IF group_owner IS NOT NULL AND NEW.user_id != group_owner THEN
    INSERT INTO public.notifications (user_id, actor_id, type, group_id)
    VALUES (NEW.user_id, group_owner, 'group_added', NEW.group_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_member_create_notification ON public.group_members;
CREATE TRIGGER on_group_member_create_notification
  AFTER INSERT ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_notification();

-- Auto-create notification when someone posts in a group
CREATE OR REPLACE FUNCTION public.handle_group_post_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member RECORD;
BEGIN
  -- Only for group posts
  IF NEW.group_id IS NULL THEN RETURN NEW; END IF;
  -- Notify all group members except the poster
  FOR member IN
    SELECT user_id FROM public.group_members WHERE group_id = NEW.group_id AND user_id != NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, actor_id, type, post_id, group_id)
    VALUES (member.user_id, NEW.user_id, 'group_post', NEW.id, NEW.group_id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_group_post_create_notification ON public.voice_posts;
CREATE TRIGGER on_group_post_create_notification
  AFTER INSERT ON public.voice_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_post_notification();

-- Auto-create notification when a friend (someone you follow) posts a VocMe
CREATE OR REPLACE FUNCTION public.handle_friend_post_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  follower RECORD;
BEGIN
  -- Only for public posts (no group_id)
  IF NEW.group_id IS NOT NULL THEN RETURN NEW; END IF;
  -- Notify all followers of the poster
  FOR follower IN
    SELECT follower_id FROM public.follows WHERE following_id = NEW.user_id
  LOOP
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (follower.follower_id, NEW.user_id, 'friend_post', NEW.id);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_friend_post_create_notification ON public.voice_posts;
CREATE TRIGGER on_friend_post_create_notification
  AFTER INSERT ON public.voice_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_friend_post_notification();
