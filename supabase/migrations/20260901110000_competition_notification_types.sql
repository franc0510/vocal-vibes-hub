-- ============================================================
-- Notifications des compétitions
--
-- notifications.type porte une contrainte CHECK énumérant les types connus.
-- Y insérer un type absent échoue — et le pont temps réel qui déclenche les
-- notifications locales avale l'erreur : le symptôme serait « les invitations
-- n'arrivent jamais », sans rien dans les journaux.
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'like', 'comment', 'share', 'follow',
      'group_added', 'group_post', 'friend_post', 'weekly_winner',
      -- Nouveaux : invitation reçue, thème du jour, résultat final.
      'competition_invite', 'competition_day', 'competition_result'
    ));
END $$;

-- actor_id était NOT NULL, ce qui suppose qu'une notification a toujours un
-- auteur humain. C'est faux ici : « nouveau thème aujourd'hui » et « voici le
-- vainqueur » viennent du système, personne ne les déclenche. Les insérer
-- échouerait, et l'erreur serait avalée par le pont temps réel.
--
-- Le client sait déjà faire : useRealtimeNotifications teste `if (notif.actor_id)`
-- avant de chercher un nom. Rien à changer côté app.
ALTER TABLE public.notifications ALTER COLUMN actor_id DROP NOT NULL;

-- De quoi ouvrir la bonne compétition quand on tape la notification.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='notifications' AND column_name='competition_id') THEN
    ALTER TABLE public.notifications
      ADD COLUMN competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE;
  END IF;
END $$;
