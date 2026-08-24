-- ============================================================
-- Story videos: an MP4 of the panels over the original voice,
-- an opt-in at publish time, and the hook for paid generations.
-- ============================================================

-- 1) New columns on voice_posts
DO $$
BEGIN
  -- The assembled MP4. Null while it does not exist yet; the app falls back
  -- to playing the panels itself.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='video_url') THEN
    ALTER TABLE public.voice_posts ADD COLUMN video_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='video_status') THEN
    ALTER TABLE public.voice_posts ADD COLUMN video_status TEXT NOT NULL DEFAULT 'none';
  END IF;
  -- Set at publish time by the "generate the video" switch. Transcription
  -- reads it to know whether to chain into illustration.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='illustration_requested') THEN
    ALTER TABLE public.voice_posts ADD COLUMN illustration_requested BOOLEAN NOT NULL DEFAULT false;
  END IF;
  -- The real length of the recording, in milliseconds. `duration` is a whole
  -- number of seconds from a counter, which truncated the last words of every
  -- video built from it.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='duration_ms') THEN
    ALTER TABLE public.voice_posts ADD COLUMN duration_ms INTEGER;
  END IF;
  -- When a generation was started for this post. The weekly allowance counts
  -- these, so it needs its own timestamp: the post's created_at says when the
  -- anecdote was published, which can be months earlier.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='illustration_generated_at') THEN
    ALTER TABLE public.voice_posts ADD COLUMN illustration_generated_at TIMESTAMPTZ;
  END IF;
END $$;

-- The quota reads "this user's generations since a date", so index that pair.
CREATE INDEX IF NOT EXISTS voice_posts_illustration_generated_idx
  ON public.voice_posts (user_id, illustration_generated_at)
  WHERE illustration_generated_at IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.voice_posts
    ADD CONSTRAINT voice_posts_video_status_check
    CHECK (video_status IN ('none', 'pending', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Storage for the assembled videos
INSERT INTO storage.buckets (id, name, public)
  VALUES ('story_videos', 'story_videos', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view story videos" ON storage.objects;
CREATE POLICY "Anyone can view story videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'story_videos');

-- Uploads are service-role only, as for story_images: a video is generated,
-- never submitted.
DROP POLICY IF EXISTS "Users can delete own story videos" ON storage.objects;
CREATE POLICY "Users can delete own story videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'story_videos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Generation credits
--
-- The free allowance is one generation per rolling week, counted from the
-- posts themselves. A credit buys one generation beyond that. Nothing grants
-- credits yet: selling them on iOS requires Apple's in-app purchase, which is
-- a separate piece of work. This table is the seam it will plug into.
CREATE TABLE IF NOT EXISTS public.illustration_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.illustration_credits ENABLE ROW LEVEL SECURITY;

-- A user may read their own balance. Only the service role writes it, so a
-- client cannot grant itself generations.
DROP POLICY IF EXISTS "Users can view own credits" ON public.illustration_credits;
CREATE POLICY "Users can view own credits" ON public.illustration_credits
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 4) Realtime, so the app can swap the placeholder for the video the moment
--    it is ready without polling.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.illustration_credits; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
