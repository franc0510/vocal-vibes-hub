-- ============================================================
-- Une invitation se lit avant d'être acceptée.
--
-- La politique de lecture des compétitions dit : publique, ou propriétaire, ou
-- déjà membre. Rien d'autre. Un code d'invitation n'y figure pas — ce qui a
-- deux conséquences, dont une était un bug en production :
--
--   1. Un lien d'invitation ne peut RIEN montrer d'un défi privé. La ligne est
--      invisible tant qu'on n'est pas dedans, donc on rejoindrait à l'aveugle.
--   2. Pire : « rejoindre avec un code » NE MARCHAIT PAS pour un défi privé.
--      `findByCode` lit la table sous cette même politique, obtenait zéro
--      ligne, et l'écran répondait « No challenge with that code ». Le code de
--      partage — présenté dans le schéma comme « le sésame d'une compétition
--      privée » — n'a donc jamais ouvert quoi que ce soit.
--
-- RLS travaille par ligne, pas par colonne : aucune politique ne peut dire
-- « montre ces cinq champs à qui détient le code ». D'où une fonction, qui
-- expose exactement ce qu'une invitation doit montrer, et rien de plus.
--
-- CONNAÎTRE LE CODE EST LA PREUVE DE L'INVITATION.
--
-- C'est déjà ce que le schéma suppose : le code est unique, tiré dans un
-- alphabet sans ambiguïté, et il ne circule que si son propriétaire l'a
-- partagé. Ce qu'on ne révèle pas ici : les membres, les votes, les anecdotes.
-- Seulement de quoi décider si l'on entre.
-- ============================================================

CREATE OR REPLACE FUNCTION public.competition_invite_preview(code TEXT)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  comp public.competitions;
  wanted TEXT := upper(btrim(coalesce(code, '')));
BEGIN
  -- Un code vide ne doit pas ramener la première ligne venue.
  IF wanted = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO comp FROM public.competitions c WHERE c.join_code = wanted;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', comp.id,
    'name', comp.name,
    'description', comp.description,
    'prize', comp.prize,
    'visibility', comp.visibility,
    'starts_on', comp.starts_on,
    'ends_on', comp.ends_on,
    'timezone', comp.timezone,
    'closed_at', comp.closed_at,
    -- La durée n'est pas un réglage : c'est le nombre de jours.
    'day_count', (SELECT count(*) FROM public.competition_days d
                   WHERE d.competition_id = comp.id),
    'member_count', (SELECT count(*) FROM public.competition_members m
                      WHERE m.competition_id = comp.id),
    -- Les équipes sont nécessaires AVANT d'entrer : on choisit son camp en
    -- rejoignant, et ce choix est définitif. Les cacher obligerait à s'engager
    -- sans savoir entre quoi et quoi.
    'teams', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
                       ORDER BY t.name)
      FROM public.competition_teams t WHERE t.competition_id = comp.id
    ), '[]'::jsonb),
    -- Pour que l'écran sache proposer « rejoindre » ou « ouvrir ».
    'is_member', public.is_competition_member(comp.id),
    'is_open', public.competition_is_open(comp.id)
  );
END;
$$;

-- `anon` y a droit : quelqu'un qui reçoit un lien n'a pas encore de compte, et
-- doit pouvoir voir à quoi on l'invite avant de s'inscrire. C'est précisément
-- ce qui manquait — l'écran de connexion jetait l'invitation.
GRANT EXECUTE ON FUNCTION public.competition_invite_preview(TEXT)
  TO anon, authenticated, service_role;
