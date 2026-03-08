
-- Reports table for flagging bad voice posts
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can report posts" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Listened posts table for tracking which posts a user has listened to
CREATE TABLE public.listened_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.listened_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can mark posts as listened" ON public.listened_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own listened" ON public.listened_posts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
