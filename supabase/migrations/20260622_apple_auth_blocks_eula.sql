-- Blocks table for user moderation
CREATE TABLE public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, blocked_user_id),
  CHECK (user_id != blocked_user_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.blocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create blocks" ON public.blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own blocks" ON public.blocks
  FOR DELETE USING (auth.uid() = user_id);

-- Add EULA acceptance flag to profiles
ALTER TABLE public.profiles ADD COLUMN eula_accepted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN eula_accepted_at TIMESTAMPTZ;

-- Update profile policies to allow EULA updates
CREATE POLICY "Users can accept EULA" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Logs for reports (for admin dashboard later)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, reviewed, resolved
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit reports" ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT USING (auth.uid() = user_id);
