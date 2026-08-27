-- ============================================================
--  VocMe — recréer la table listened_posts, absente de la base
-- ============================================================
--
--  À COLLER DANS : tableau de bord Supabase → SQL Editor → Run
--
--  Pourquoi : l'audit du schéma a trouvé cette table dans les migrations
--  du dépôt (20260308144117) mais PAS dans la base déployée. L'app s'en
--  sert à deux endroits, et les deux échouaient en silence :
--
--    • useVoicePosts la lit pour trier « les non écoutées d'abord » ;
--      sans elle, la liste revient vide et le critère ne joue jamais.
--    • RealsViewer y écrit à chaque écoute terminée ; sans elle, rien
--      n'est enregistré et aucune erreur n'apparaît.
--
--  Ce fichier reprend exactement la définition de la migration, rendue
--  rejouable : chaque objet est conditionné à son absence, donc le
--  relancer ne casse rien et ne perd aucune donnée.
-- ============================================================

-- 1) La table
--    UNIQUE(user_id, post_id) porte aussi l'index qui sert la lecture
--    « ce que cet utilisateur a écouté » — pas besoin d'en ajouter un.
CREATE TABLE IF NOT EXISTS public.listened_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, post_id)
);

ALTER TABLE public.listened_posts ENABLE ROW LEVEL SECURITY;

-- 2) Row-level security
--    Une écoute est une donnée privée : chacun n'écrit et ne lit que la
--    sienne. Aucune politique de lecture pour les tiers, volontairement.
DROP POLICY IF EXISTS "Users can mark posts as listened" ON public.listened_posts;
CREATE POLICY "Users can mark posts as listened" ON public.listened_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own listened" ON public.listened_posts;
CREATE POLICY "Users can view own listened" ON public.listened_posts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3) Realtime, comme le prévoyait 20260326100000
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.listened_posts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
