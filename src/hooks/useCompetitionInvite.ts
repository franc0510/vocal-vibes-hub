import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Ce qu'une invitation montre avant d'être acceptée.
 *
 * Elle ne peut pas venir d'une lecture de `competitions` : la politique de
 * lecture dit « publique, ou propriétaire, ou déjà membre », et un code
 * d'invitation n'y figure pas. Un défi privé est donc invisible tant qu'on
 * n'est pas dedans — ce qui, en plus d'empêcher toute prévisualisation,
 * cassait « rejoindre avec un code » pour les défis privés.
 *
 * La fonction `competition_invite_preview` répond à la place, en n'exposant
 * que ce qu'une invitation doit montrer : de quoi décider si l'on entre.
 */

export interface InvitePreview {
  id: string;
  name: string;
  description: string | null;
  prize: string | null;
  visibility: "public" | "private";
  starts_on: string;
  ends_on: string;
  timezone: string | null;
  closed_at: string | null;
  day_count: number;
  member_count: number;
  teams: { id: string; name: string; color: string | null }[];
  is_member: boolean;
  is_open: boolean;
}

/** Lit une invitation à partir de son code. `null` si le code ne mène à rien. */
export const fetchInvite = async (code: string): Promise<InvitePreview | null> => {
  const { data, error } = await db.rpc("competition_invite_preview", { code });
  if (error) throw error;
  return (data ?? null) as InvitePreview | null;
};

export const useCompetitionInvite = (code: string | undefined) => {
  const { user } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!code) { setInvite(null); setLoading(false); return; }
    setLoading(true);
    setFailed(false);
    try {
      setInvite(await fetchInvite(code));
    } catch {
      // Un réseau coupé et un code inconnu ne se disent pas pareil : l'un
      // invite à réessayer, l'autre non.
      setFailed(true);
      setInvite(null);
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Rechargé quand l'identité change : `is_member` en dépend, et c'est ce qui
  // fait basculer l'écran de « rejoindre » à « ouvrir » juste après connexion.
  useEffect(() => { refresh(); }, [refresh, user?.id]);

  return { invite, loading, failed, refresh };
};
