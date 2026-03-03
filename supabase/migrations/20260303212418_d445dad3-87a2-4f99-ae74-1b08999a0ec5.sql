
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('like', 'comment', 'share', 'follow')),
  post_id UUID REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- System/triggers can insert (via security definer), but also allow authenticated insert for now
CREATE POLICY "Authenticated can insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Users can update their own notifications (mark read)
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create notification on like
CREATE OR REPLACE FUNCTION public.handle_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_owner UUID;
BEGIN
  SELECT user_id INTO post_owner FROM public.voice_posts WHERE id = NEW.post_id;
  IF post_owner IS NOT NULL AND post_owner != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_like_create_notification
  AFTER INSERT ON public.voice_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_like_notification();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
