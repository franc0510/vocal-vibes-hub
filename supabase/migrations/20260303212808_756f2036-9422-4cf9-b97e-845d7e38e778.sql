
-- Create comments table (text + voice)
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.voice_posts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  voice_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can insert comments" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-create notification on comment
CREATE OR REPLACE FUNCTION public.handle_comment_notification()
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
    VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_comment_create_notification
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_comment_notification();

-- Create voice_comments storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice_comments', 'voice_comments', true);

CREATE POLICY "Anyone can view voice comments" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice_comments');

CREATE POLICY "Authenticated can upload voice comments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice_comments');
