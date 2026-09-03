-- ============================================================
-- Les notifications qui sortent du téléphone.
--
-- Jusqu'ici, TOUTES les notifications de cette application étaient locales :
-- déclenchées par du JavaScript, donc seulement si l'application tournait. Un
-- like reçu pendant qu'on dort n'arrivait jamais — la ligne restait en base,
-- visible plus tard dans le panneau, mais aucune bannière ne partait.
--
-- Cette migration pose les deux choses qui manquaient en base :
--   1. Où ranger le jeton d'un appareil, pour qu'APNs sache à qui parler.
--   2. Le registre des récompenses déjà annoncées, pour ne les annoncer
--      qu'une fois.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Les jetons d'appareil
--
--    Un compte, plusieurs appareils : la clé est le jeton, pas l'utilisateur.
--    Un jeton appartient à un seul compte à la fois — se déconnecter puis
--    reconnecter un autre compte sur le même téléphone doit transférer le
--    jeton, pas en créer un second qui enverrait à la mauvaise personne.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ios',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Posé quand APNs répond « ce jeton n'existe plus » (410). Sans ça la table
  -- se remplit de téléphones réinstallés, et chaque envoi paie leur échec.
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.device_tokens
    ADD CONSTRAINT device_tokens_platform_check
    CHECK (platform IN ('ios', 'android', 'web'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- L'envoi lit « tous les jetons vivants de cette personne » : c'est le seul
-- accès du chemin chaud, et il mérite son index.
CREATE INDEX IF NOT EXISTS device_tokens_user_live_idx
  ON public.device_tokens (user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Un jeton est un moyen d'atteindre quelqu'un : personne d'autre que son
-- propriétaire ne doit pouvoir le lire, et surtout pas en déposer un au nom
-- d'autrui — ce serait rediriger les notifications d'un tiers vers soi.
DROP POLICY IF EXISTS "Own device tokens are visible" ON public.device_tokens;
CREATE POLICY "Own device tokens are visible" ON public.device_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Register own device" ON public.device_tokens;
CREATE POLICY "Register own device" ON public.device_tokens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Refresh own device" ON public.device_tokens;
CREATE POLICY "Refresh own device" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Forget own device" ON public.device_tokens;
CREATE POLICY "Forget own device" ON public.device_tokens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

/**
 * Enregistre le jeton de CET appareil pour la personne connectée.
 *
 * Le même téléphone peut servir deux comptes l'un après l'autre. L'unicité
 * porte donc sur le jeton, et réenregistrer transfère la propriété au lieu
 * d'échouer : sans ça, les notifications du nouveau compte partiraient vers
 * l'ancien, ce qui est une fuite et pas seulement une gêne.
 */
CREATE OR REPLACE FUNCTION public.register_device_token(device_token TEXT, device_platform TEXT DEFAULT 'ios')
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), device_token, coalesce(device_platform, 'ios'))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(),
        platform = coalesce(device_platform, 'ios'),
        last_seen_at = now(),
        revoked_at = NULL;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_token(TEXT, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) Gagner un jour ne se dit pas comme gagner le défi
-- ------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'share', 'follow',
    'group_added', 'group_post', 'friend_post', 'weekly_winner',
    'competition_invite', 'competition_day', 'competition_result',
    -- Remporter le thème d'un jour : ça arrive chaque matin, ça mène à l'urne
    -- de la veille, et ça ne veut pas dire qu'on a gagné le défi.
    'competition_day_won'
  ));

-- ------------------------------------------------------------
-- 3) Le registre des récompenses annoncées
--
--    Gagner un jour n'est PAS un événement de base : `day_wins` se calcule à
--    la lecture, dans la vue, à partir des votes et de l'heure. On devient
--    vainqueur parce que `now()` a dépassé 4 h — ce sur quoi aucun trigger ne
--    peut se poser. C'est donc une tâche planifiée qui l'annonce.
--
--    Cette table dit ce qui a DÉJÀ été annoncé, et rien d'autre. Elle n'est
--    pas une source de score : la vue reste seule à dire qui a gagné. Deux
--    sources finiraient par se contredire, et c'est exactement ce que tout ce
--    moteur évite depuis le début.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.competition_day_awards (
  day_id UUID NOT NULL REFERENCES public.competition_days(id) ON DELETE CASCADE,
  -- NUL veut dire « ce jour a été dépouillé, et personne n'a gagné » : c'est
  -- le cas d'une journée sans le moindre vote. Sans cette ligne, la tâche
  -- planifiée rouvrirait ce jour à chaque passage, indéfiniment.
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  announced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT : sans cela deux lignes « personne n'a gagné » pour le
  -- même jour seraient toutes deux acceptées, Postgres considérant chaque NUL
  -- comme différent des autres.
  UNIQUE NULLS NOT DISTINCT (day_id, user_id)
);

ALTER TABLE public.competition_day_awards ENABLE ROW LEVEL SECURITY;

-- Lisible par les participants : l'écran peut ainsi montrer les jours déjà
-- dépouillés sans refaire le calcul. Écrit uniquement par la clé de service,
-- donc aucune politique d'écriture — comme les modèles de compétition.
DROP POLICY IF EXISTS "Awards follow their competition" ON public.competition_day_awards;
CREATE POLICY "Awards follow their competition" ON public.competition_day_awards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.competition_days d
      WHERE d.id = day_id AND public.is_competition_member(d.competition_id)
    )
  );

-- ------------------------------------------------------------
-- 4) Le pont base → APNs
--
--    Une notification insérée doit partir tout de suite : un like reçu se dit
--    dans la seconde, pas au prochain passage d'une tâche planifiée.
--
--    `pg_net` n'existe que sur Supabase. La chaîne de migrations est rejouée
--    en intégration continue sur un Postgres nu, où un `CREATE EXTENSION` sec
--    ferait tout échouer — d'où le garde. Sans l'extension, la base se monte
--    normalement et le pont n'existe simplement pas.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    RAISE NOTICE 'pg_net indisponible : le pont push n''est pas installé (attendu hors Supabase).';
    RETURN;
  END IF;

  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.push_new_notification()
    RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $body$
    DECLARE
      base TEXT := current_setting('app.settings.functions_url', true);
      key  TEXT := current_setting('app.settings.service_role_key', true);
    BEGIN
      -- Sans réglage, on ne fait rien plutôt que d'échouer : une notification
      -- doit s'écrire même si l'envoi n'est pas configuré.
      IF base IS NULL OR key IS NULL THEN
        RETURN NULL;
      END IF;
      PERFORM extensions.net_http_post(
        url := base || '/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || key
        ),
        body := jsonb_build_object('notification_id', NEW.id)
      );
      RETURN NULL;
    END;
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS push_new_notification_trigger ON public.notifications';
  EXECUTE 'CREATE TRIGGER push_new_notification_trigger
             AFTER INSERT ON public.notifications
             FOR EACH ROW EXECUTE FUNCTION public.push_new_notification()';
EXCEPTION WHEN OTHERS THEN
  -- Le pont est un confort, pas une condition : s'il ne s'installe pas, la
  -- base doit rester utilisable et les notifications continuer de s'écrire.
  RAISE NOTICE 'Pont push non installé : %', SQLERRM;
END $$;
