CREATE OR REPLACE FUNCTION public.increment_shares_count(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE voice_posts SET shares_count = shares_count + 1 WHERE id = p_post_id;
END;
$$;

-- Enable realtime for likes and comments tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_post_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;