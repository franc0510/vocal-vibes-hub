import { useVoicePosts } from "@/hooks/useVoicePosts";
import { isIllustrated } from "@/lib/feedOrder";

/**
 * What the feed hook actually received, on this device.
 *
 * Every remote check says the data and the ordering are right, and the app
 * still shows something else. That gap can only be closed by looking at the
 * rows the phone itself got — so this prints them, in order, with the exact
 * fields the ordering depends on. One screenshot settles it.
 *
 * Reachable at /diag. It reads nothing extra: same hook as the feed.
 */
const DiagPage = () => {
  const { posts, loading, refreshError, refetch } = useVoicePosts();
  const lead = posts.filter(isIllustrated).length;

  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground p-4 text-xs font-mono">
      <h1 className="text-sm font-bold mb-3">Diagnostic du feed</h1>

      <div className="mb-3 space-y-1">
        <div>chargement : {String(loading)}</div>
        <div className={refreshError ? "text-destructive font-bold" : ""}>
          erreur : {refreshError ?? "aucune"}
        </div>
        <div>posts reçus : {posts.length}</div>
        <div className={lead === 0 ? "text-destructive font-bold" : ""}>
          vues comme illustrées : {lead}
        </div>
      </div>

      <button
        onClick={() => refetch()}
        className="mb-4 px-3 py-1.5 rounded bg-primary text-primary-foreground"
      >
        Recharger
      </button>

      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="py-1 pr-1">#</th>
            <th className="py-1 pr-1">titre</th>
            <th className="py-1 pr-1">statut</th>
            <th className="py-1 pr-1">vidéo</th>
            <th className="py-1">grp</th>
          </tr>
        </thead>
        <tbody>
          {posts.slice(0, 12).map((p, i) => (
            <tr key={p.id} className="border-b border-border/40 align-top">
              <td className="py-1 pr-1">{i + 1}</td>
              <td className="py-1 pr-1 break-all">{p.title?.slice(0, 22)}</td>
              {/* undefined means the column never arrived; "none" means it did. */}
              <td className="py-1 pr-1">
                {p.illustration_status === undefined ? "ABSENT" : String(p.illustration_status)}
              </td>
              <td className="py-1 pr-1">
                {p.video_url === undefined ? "ABSENT" : p.video_url ? "oui" : "non"}
              </td>
              <td className="py-1">{p.group_id ? "oui" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 text-muted-foreground leading-relaxed">
        « ABSENT » veut dire que la colonne n'est jamais arrivée jusqu'ici.
        « none » veut dire qu'elle est arrivée, avec cette valeur.
      </p>
    </div>
  );
};

export default DiagPage;
