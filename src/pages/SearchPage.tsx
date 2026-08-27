import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface UserResult {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
}

interface ExplorePost {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  created_at: string;
  likes_count: number;
  comments_count: number;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  /** First generated panel, when the anecdote is illustrated. */
  illustration_cover_url: string | null;
}

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;


// Explore tile. An illustrated anecdote shows its first panel edge to edge, the
// way a picture grid is meant to read; the rest keep the avatar layout, since a
// tile with nothing to show is better honest than padded with a placeholder.
const ExploreTile = ({ post, onSelect }: { post: ExplorePost; onSelect: () => void }) => {
  const initials = (post.author_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  if (post.illustration_cover_url) {
    return (
      <button
        onClick={onSelect}
        className="aspect-square rounded-xl relative overflow-hidden group"
      >
        <img
          src={post.illustration_cover_url}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform group-active:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <Play size={14} className="absolute top-2 right-2 text-white drop-shadow fill-white" />
        <div className="absolute inset-x-0 bottom-0 p-2 text-left">
          <p className="text-[10px] text-white font-medium line-clamp-2 leading-tight drop-shadow">{post.title}</p>
          <p className="text-[9px] text-white/75 mt-0.5">{formatDuration(post.duration)}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onSelect}
      className="aspect-square bg-card border border-border/30 rounded-xl flex flex-col items-center justify-center p-2 hover:bg-primary/5 transition-colors relative overflow-hidden"
    >
      {post.author_avatar_url ? (
        <img src={post.author_avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-primary/30 mb-1.5" />
      ) : (
        <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center mb-1.5 text-xs font-bold text-primary-foreground">
          {initials}
        </div>
      )}
      <p className="text-[10px] text-foreground font-medium text-center line-clamp-2 leading-tight px-1">{post.title}</p>
      <p className="text-[9px] text-muted-foreground mt-0.5">{formatDuration(post.duration)}</p>
    </button>
  );
};

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch random public VocMes on mount
  useEffect(() => {
    const loadExplore = async () => {
      setExploreLoading(true);

      // Get public posts (no group_id) ordered randomly-ish
      const { data: postsData } = await supabase
        .from("voice_posts")
        .select("*")
        .is("group_id" as any, null)
        .order("created_at", { ascending: false })
        .limit(60);

      if (!postsData || postsData.length === 0) {
        setExplorePosts([]);
        setExploreLoading(false);
        return;
      }

      // Shuffle, then float the illustrated ones to the front. Explore is a
      // picture grid, so the anecdotes that actually have pictures lead it —
      // the same rule the feed follows. Shuffling still varies the order
      // inside each half from one visit to the next.
      const shuffled = [...postsData].sort(() => Math.random() - 0.5);
      const illustrated = (p: (typeof shuffled)[number]) =>
        Boolean((p as { illustration_cover_url?: string | null }).illustration_cover_url) ||
        Boolean((p as { video_url?: string | null }).video_url);
      const ordered = [...shuffled.filter(illustrated), ...shuffled.filter((p) => !illustrated(p))];

      // Enrich with author info
      const authorIds = [...new Set(ordered.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", authorIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      const enriched: ExplorePost[] = ordered.map((p) => {
        const author = pMap.get(p.user_id);
        return {
          id: p.id,
          title: p.title,
          audio_url: p.audio_url,
          duration: p.duration,
          created_at: p.created_at,
          likes_count: p.likes_count ?? 0,
          comments_count: p.comments_count ?? 0,
          user_id: p.user_id,
          author_name: author?.display_name || "User",
          author_avatar_url: author?.avatar_url || null,
          illustration_cover_url: (p as { illustration_cover_url?: string | null }).illustration_cover_url ?? null,
        };
      });

      setExplorePosts(enriched);
      setExploreLoading(false);
    };
    loadExplore();
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setUsers([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    // Search users
    const { data: usersData } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(10);

    setUsers((usersData as UserResult[]) || []);

    // Filter explore posts by title match
    if (q.length >= 2) {
      const filtered = explorePosts.filter((p) =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.author_name.toLowerCase().includes(q.toLowerCase())
      );
      // If we have filtered results, show them; otherwise keep all
      if (filtered.length > 0) {
        setExplorePosts((prev) => [...filtered, ...prev.filter((p) => !filtered.find((f) => f.id === p.id))]);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen pb-24 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red mb-3">Explore</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search users or voice stories..."
            className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          />
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* User search results */}
      {!loading && searched && users.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Users</h2>
          <div className="space-y-1">
            {users.map((u) => {
              const initials = (u.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <motion.button
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => navigate(`/user/${u.id}`)}
                  className="w-full flex items-center gap-3 bg-card rounded-xl p-3 border border-border/50 hover:bg-primary/5 transition-colors text-left"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.display_name}</p>
                    {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && searched && users.length === 0 && explorePosts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">No results for "{query}"</p>
      )}

      {/* Explore grid */}
      {!loading && (
        <div>
          {searched && <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">VocMes</h2>}
          {exploreLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : explorePosts.length === 0 ? (
            <div className="text-center py-16">
              <Search size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No public VocMes yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {explorePosts.map((post) => (
                <ExploreTile key={post.id} post={post} onSelect={() => navigate(`/vocme/${post.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchPage;
