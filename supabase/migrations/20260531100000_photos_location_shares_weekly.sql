-- ============================================================
-- New features: photos, location, share notifications,
-- friend-post notifications, and weekly "VocMe of the week"
-- ============================================================

-- 1) Add image_url + location + transcription columns to voice_posts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='image_url') THEN
    ALTER TABLE public.voice_posts ADD COLUMN image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='location') THEN
    ALTER TABLE public.voice_posts ADD COLUMN location TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='transcription') THEN
    ALTER TABLE public.voice_posts ADD COLUMN transcription TEXT;
  END IF;
END $$;

-- 2) Storage bucket for VocMe background photos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('voice_images', 'voice_images', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view voice images" ON storage.objects;
CREATE POLICY "Anyone can view voice images" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice_images');

DROP POLICY IF EXISTS "Authenticated can upload voice images" ON storage.objects;
CREATE POLICY "Authenticated can upload voice images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice_images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own voice images" ON storage.objects;
CREATE POLICY "Users can delete own voice images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'voice_images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Shares tracking table (one row per user per post share) + notification trigger
CREATE TABLE IF NOT EXISTS public.voice_post_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_post_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view shares" ON public.voice_post_shares;
CREATE POLICY "Anyone can view shares" ON public.voice_post_shares FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can record shares" ON public.voice_post_shares;
CREATE POLICY "Users can record shares" ON public.voice_post_shares
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Notification when someone shares your VocMe
CREATE OR REPLACE FUNCTION public.handle_share_notification()
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
    VALUES (post_owner, NEW.user_id, 'share', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_share_create_notification ON public.voice_post_shares;
CREATE TRIGGER on_share_create_notification
  AFTER INSERT ON public.voice_post_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_share_notification();

-- 4) Weekly votes for "VocMe of the week"
-- week_start = the Monday (date) of the week the voting targets
CREATE TABLE IF NOT EXISTS public.vocme_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(voter_id, week_start)
);

ALTER TABLE public.vocme_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view votes" ON public.vocme_votes;
CREATE POLICY "Anyone can view votes" ON public.vocme_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can vote" ON public.vocme_votes;
CREATE POLICY "Users can vote" ON public.vocme_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);
DROP POLICY IF EXISTS "Users can change their vote" ON public.vocme_votes;
CREATE POLICY "Users can change their vote" ON public.vocme_votes
  FOR UPDATE TO authenticated USING (auth.uid() = voter_id);
DROP POLICY IF EXISTS "Users can remove their vote" ON public.vocme_votes;
CREATE POLICY "Users can remove their vote" ON public.vocme_votes
  FOR DELETE TO authenticated USING (auth.uid() = voter_id);

-- 5) Make sure realtime is enabled for the new tables
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_post_shares; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vocme_votes; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
