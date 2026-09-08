import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Ce qu'une invitation à un groupe montre avant d'être acceptée.
 *
 * Elle ne peut pas venir d'une lecture de `groups` : depuis que le code de
 * partage vit dans cette table, la ligne n'est plus lisible que par ses
 * membres — autrement le code serait affiché sur la porte qu'il est censé
 * tenir. Un invité n'est justement pas encore membre.
 *
 * La fonction `group_invite_preview` répond à sa place, en n'exposant que ce
 * qu'une invitation doit montrer : le nom, qui invite, combien ils sont. Ni la
 * liste des membres, ni les anecdotes du groupe.
 */

export interface GroupInvitePreview {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
  is_member: boolean;
}

/** Lit une invitation à partir de son code. `null` si le code ne mène à rien. */
export const fetchGroupInvite = async (code: string): Promise<GroupInvitePreview | null> => {
  const { data, error } = await db.rpc("group_invite_preview", { code });
  if (error) throw error;
  return (data ?? null) as GroupInvitePreview | null;
};

export const useGroupInvite = (code: string | undefined) => {
  const { user } = useAuth();
  const [invite, setInvite] = useState<GroupInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!code) { setInvite(null); setLoading(false); return; }
    setLoading(true);
    setFailed(false);
    try {
      setInvite(await fetchGroupInvite(code));
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
