
-- Add visibility column to voice_posts (public or private)
ALTER TABLE public.voice_posts ADD COLUMN visibility text NOT NULL DEFAULT 'public';

-- Add is_private column to profiles
ALTER TABLE public.profiles ADD COLUMN is_private boolean NOT NULL DEFAULT false;

-- Update RLS for voice_posts SELECT: public posts visible to all, private posts only to author and their followers
DROP POLICY "Anyone can view voice posts" ON public.voice_posts;
CREATE POLICY "View voice posts based on visibility"
ON public.voice_posts FOR SELECT
USING (
  visibility = 'public'
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.follows
    WHERE follows.follower_id = auth.uid()
    AND follows.following_id = voice_posts.user_id
  )
);
