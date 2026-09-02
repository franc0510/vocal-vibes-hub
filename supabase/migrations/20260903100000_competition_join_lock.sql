-- ============================================================
-- L'équipe se choisit en rejoignant, et une seule fois.
--
-- Jusqu'ici le verrou tombait à la première anecdote publiée. À l'usage c'est
-- trop tard et trop flou : on rejoint, on hésite, on change trois fois, et
-- surtout on peut encore basculer vers l'équipe qui mène tant qu'on n'a rien
-- publié. La règle devient donc :
--
--   ON CHOISIT SON CAMP EN ENTRANT, ET C'EST DÉFINITIF.
--
-- Une seule décision, à un seul moment — celui où l'on ne sait pas encore qui
-- va gagner. C'est ce qui rend le choix honnête.
-- ============================================================

/**
 * Pose le verrou dès que l'équipe devient non nulle.
 *
 * Deux chemins mènent ici et le trigger les couvre tous les deux : l'équipe
 * choisie au moment de rejoindre (INSERT), et celle choisie après coup par un
 * membre entré sans camp (UPDATE). Dans les deux cas la politique RLS
 * « Members change team until locked » (USING ... AND locked_at IS NULL) ferme
 * ensuite la porte d'elle-même.
 *
 * Écrit dans un trigger et non dans le client : une valeur que l'application
 * pose elle-même est une valeur que l'application peut oublier de poser.
 */
CREATE OR REPLACE FUNCTION public.lock_team_on_pick()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.team_id IS NOT NULL AND NEW.locked_at IS NULL THEN
    NEW.locked_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_team_on_pick_trigger ON public.competition_members;
CREATE TRIGGER lock_team_on_pick_trigger
  BEFORE INSERT OR UPDATE OF team_id ON public.competition_members
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_team_on_pick();

-- ------------------------------------------------------------
-- Le message du gel de barème, en anglais.
--
-- Il est affiché tel quel à l'utilisateur : c'est donc une chaîne d'interface,
-- et l'interface des défis est en anglais.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_competition_scoring()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.scoring IS DISTINCT FROM OLD.scoring
     AND OLD.starts_on <= (((now() AT TIME ZONE COALESCE(OLD.timezone, 'Europe/Paris'))
                            - interval '4 hours')::date)
  THEN
    RAISE EXCEPTION
      'Scoring is frozen once the challenge has started.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Un code de partage pour tout le monde, publiques comprises.
--
-- Le code n'était donné qu'aux compétitions privées, pour qui il sert de
-- sésame. Mais il sert aussi, et surtout, à inviter : « rejoins avec ABC123 »
-- se dit au téléphone, se colle dans un groupe, s'écrit au tableau. Une
-- publique sans code obligeait à expliquer comment la chercher.
-- ------------------------------------------------------------

/**
 * Un code court, lisible au téléphone : ni 0/O ni 1/I.
 *
 * Jumeau de `makeJoinCode()` dans src/hooks/useCompetitions.ts, avec le même
 * alphabet — les deux doivent produire des codes qu'on dicte sans hésiter.
 */
CREATE OR REPLACE FUNCTION public.make_join_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INTEGER;
BEGIN
  -- La colonne est UNIQUE : on retente plutôt que d'échouer sur une collision,
  -- qui reste très improbable mais pas impossible.
  FOR attempt IN 1..20 LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.competitions WHERE join_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

/**
 * Toute compétition naît avec un code.
 *
 * En trigger et non dans le client, pour la même raison que le verrou
 * d'équipe : le script de lancement, l'API et l'application créent tous des
 * compétitions, et un code posé à trois endroits est un code oublié à un
 * quatrième. Ici il n'y a qu'un seul endroit.
 */
CREATE OR REPLACE FUNCTION public.ensure_join_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.make_join_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_join_code_trigger ON public.competitions;
CREATE TRIGGER ensure_join_code_trigger
  BEFORE INSERT ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_join_code();

-- Les compétitions déjà créées sans code en reçoivent un. Une par une, la
-- fonction lisant la table pour éviter les collisions.
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM public.competitions WHERE join_code IS NULL LOOP
    UPDATE public.competitions
       SET join_code = public.make_join_code()
     WHERE id = comp.id;
  END LOOP;
END $$;
