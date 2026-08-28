-- ============================================================
--  VocMe — recréer le bucket voice_messages, absent du projet
-- ============================================================
--
--  À COLLER DANS : tableau de bord Supabase → SQL Editor → Run
--
--  Pourquoi : l'audit des buckets a trouvé voice_messages dans les
--  migrations du dépôt (20260326100000) mais PAS dans le projet déployé.
--  C'est le bucket des messages vocaux privés : sans lui, l'envoi échoue
--  et rien ne le dit.
--
--  Reprise telle quelle de la migration, rendue rejouable : chaque objet
--  est conditionné à son absence, donc relancer ne casse rien.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('voice_messages', 'voice_messages', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view voice messages" ON storage.objects;
CREATE POLICY "Anyone can view voice messages" ON storage.objects
  FOR SELECT USING (bucket_id = 'voice_messages');

DROP POLICY IF EXISTS "Authenticated users can upload voice messages" ON storage.objects;
CREATE POLICY "Authenticated users can upload voice messages" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice_messages' AND auth.role() = 'authenticated');

-- Chacun ne supprime que ses propres envois : le premier segment du chemin
-- est l'identifiant de l'auteur.
DROP POLICY IF EXISTS "Users can delete own voice messages" ON storage.objects;
CREATE POLICY "Users can delete own voice messages" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'voice_messages' AND (storage.foldername(name))[1] = auth.uid()::text);
