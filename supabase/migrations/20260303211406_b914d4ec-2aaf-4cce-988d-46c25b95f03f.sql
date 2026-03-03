
-- Create voice_posts table
CREATE TABLE public.voice_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  shares_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view posts
CREATE POLICY "Anyone can view voice posts" ON public.voice_posts
  FOR SELECT USING (true);

-- Users can insert their own posts
CREATE POLICY "Users can insert own posts" ON public.voice_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own posts
CREATE POLICY "Users can delete own posts" ON public.voice_posts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create likes table
CREATE TABLE public.voice_post_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES public.voice_posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE public.voice_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes" ON public.voice_post_likes
  FOR SELECT USING (true);

CREATE POLICY "Users can like posts" ON public.voice_post_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike posts" ON public.voice_post_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Create audio storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true);

-- Storage policies for audio bucket
CREATE POLICY "Anyone can view audio" ON storage.objects
  FOR SELECT USING (bucket_id = 'audio');

CREATE POLICY "Authenticated users can upload audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Users can delete own audio" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Enable realtime for voice_posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_posts;
