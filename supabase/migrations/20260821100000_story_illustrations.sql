-- ============================================================
-- Story illustrations: turn a voice anecdote into a sequence of
-- generated images, played back as a slideshow synced to the audio.
-- ============================================================

-- 1) New columns on voice_posts
--    illustration_status drives the UI (button / spinner / slideshow)
--    transcription_segments holds Whisper's per-segment timestamps, which
--    are what let us align each image with the moment it illustrates.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='illustration_status') THEN
    ALTER TABLE public.voice_posts ADD COLUMN illustration_status TEXT NOT NULL DEFAULT 'none';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='transcription_segments') THEN
    ALTER TABLE public.voice_posts ADD COLUMN transcription_segments JSONB;
  END IF;
  -- Denormalised first panel, so the feed can show a thumbnail without
  -- querying post_illustrations once per card.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='voice_posts' AND column_name='illustration_cover_url') THEN
    ALTER TABLE public.voice_posts ADD COLUMN illustration_cover_url TEXT;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.voice_posts
    ADD CONSTRAINT voice_posts_illustration_status_check
    CHECK (illustration_status IN ('none', 'pending', 'ready', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) One row per generated panel
CREATE TABLE IF NOT EXISTS public.post_illustrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  caption TEXT,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  style_id TEXT NOT NULL DEFAULT 'ligne-claire',
  provider TEXT,
  model TEXT,
  cost_usd NUMERIC(10, 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, idx)
);

-- No index on (post_id, idx) here: the UNIQUE constraint above already
-- provides one, and it serves the ordered read the slideshow does.

-- Daily quota lookups filter on a time window.
CREATE INDEX IF NOT EXISTS post_illustrations_created_at_idx
  ON public.post_illustrations (created_at);

ALTER TABLE public.post_illustrations ENABLE ROW LEVEL SECURITY;

-- Illustrations are as public as the posts they belong to.
DROP POLICY IF EXISTS "Anyone can view illustrations" ON public.post_illustrations;
CREATE POLICY "Anyone can view illustrations" ON public.post_illustrations
  FOR SELECT USING (true);

-- Writes only ever come from the illustrate-story Edge Function, which runs
-- with the service role and therefore bypasses RLS. No client-side INSERT or
-- UPDATE policy exists on purpose: a user must not be able to forge panels.
DROP POLICY IF EXISTS "Users can delete illustrations of own posts" ON public.post_illustrations;
CREATE POLICY "Users can delete illustrations of own posts" ON public.post_illustrations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.voice_posts p
    WHERE p.id = post_illustrations.post_id AND p.user_id = auth.uid()
  ));

-- 3) Storage bucket for the generated panels
INSERT INTO storage.buckets (id, name, public)
  VALUES ('story_images', 'story_images', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view story images" ON storage.objects;
CREATE POLICY "Anyone can view story images" ON storage.objects
  FOR SELECT USING (bucket_id = 'story_images');

-- Uploads are service-role only (the Edge Function). Users may clean up
-- their own folder when they delete a post's illustrations.
DROP POLICY IF EXISTS "Users can delete own story images" ON storage.objects;
CREATE POLICY "Users can delete own story images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'story_images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4) Realtime, so the client can swap the spinner for the slideshow
--    the moment the Edge Function flips the status to 'ready'.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.post_illustrations; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
