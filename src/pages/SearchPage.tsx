import { useState, useRef } from "react";
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

interface PostResult {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  created_at: string;
  user_id: string;
  author_name: string;
  author_avatar: string;
}

const generateWaveform = () => Array.from({ length: 20 }, () => 0.15 + Math.random() * 0.85);

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const PostItem = ({ post, onClick }: { post: PostResult; onClick: () => void }) => {
  const waveform = useRef(generateWaveform()).current;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 bg-card rounded-xl p-3 border border-border/50 text-left hover:bg-primary/5 transition-colors"
    >
      <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-primary-foreground shrink-0 shadow-red">
        <Play size={16} className="ml-0.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
        <p className="text-[10px] text-muted-foreground">{post.author_name} · {formatTime(post.created_at)} · {formatDuration(post.duration)}</p>
      </div>
    </motion.button>
  );
};

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [posts, setPosts] = useState<PostResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setUsers([]);
      setPosts([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    // Search users & posts in parallel
    const [usersRes, postsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
        .limit(10),
      supabase
        .from("voice_posts")
        .select("*")
        .ilike("title", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setUsers((usersRes.data as UserResult[]) || []);

    // Enrich posts with author info
    const rawPosts = postsRes.data || [];
    if (rawPosts.length > 0) {
      const authorIds = [...new Set(rawPosts.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p.display_name || "User"]));

      setPosts(rawPosts.map((p) => {
        const name = pMap.get(p.user_id) || "User";
        const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
        return { ...p, author_name: name, author_avatar: initials };
      }));
    } else {
      setPosts([]);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red mb-3">Search</h1>
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

      {!loading && searched && users.length === 0 && posts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">No results for "{query}"</p>
      )}

      {!loading && users.length > 0 && (
        <div className="mb-6">
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

      {!loading && posts.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Voice Stories</h2>
          <div className="space-y-2">
            {posts.map((p) => (
              <PostItem key={p.id} post={p} onClick={() => navigate(`/post/${p.id}`)} />
            ))}
          </div>
        </div>
      )}

      {!searched && !loading && (
        <div className="text-center py-16">
          <Search size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Search for users or voice stories</p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
