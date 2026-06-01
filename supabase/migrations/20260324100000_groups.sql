-- Groups table
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view groups" ON public.groups;
CREATE POLICY "Anyone can view groups" ON public.groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can update groups" ON public.groups;
CREATE POLICY "Owners can update groups" ON public.groups FOR UPDATE USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners can delete groups" ON public.groups;
CREATE POLICY "Owners can delete groups" ON public.groups FOR DELETE USING (auth.uid() = owner_id);

-- Group members table
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view group members" ON public.group_members;
CREATE POLICY "Anyone can view group members" ON public.group_members FOR SELECT USING (true);
DROP POLICY IF EXISTS "Group owners can add members" ON public.group_members;
CREATE POLICY "Group owners can add members" ON public.group_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );
DROP POLICY IF EXISTS "Group owners can remove members" ON public.group_members;
CREATE POLICY "Group owners can remove members" ON public.group_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );

-- Add group_id column to voice_posts (nullable = public post)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'voice_posts' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE public.voice_posts ADD COLUMN group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Update voice_posts RLS to restrict group posts to group members
DROP POLICY IF EXISTS "Anyone can view voice posts" ON public.voice_posts;
DROP POLICY IF EXISTS "Users can view voice posts" ON public.voice_posts;
CREATE POLICY "Users can view voice posts" ON public.voice_posts
  FOR SELECT USING (
    group_id IS NULL
    OR EXISTS (SELECT 1 FROM public.group_members WHERE group_id = voice_posts.group_id AND user_id = auth.uid())
    OR auth.uid() = user_id
  );
