import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import RealsViewer from "@/components/RealsViewer";

/**
 * The feed, opened on one chosen anecdote.
 *
 * Tapping a tile in Explore used to end the journey on a single post. This
 * keeps the scroll going: the same viewer as the home feed, starting where the
 * reader tapped, so the next anecdote is one swipe away.
 *
 * Only a back button is added — the rest is deliberately the feed itself,
 * rather than a second player to keep in step with it.
 */
const ExploreFeedPage = () => {
  const { postId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="h-full w-full flex flex-col relative">
      <header
        className="absolute top-0 left-0 right-0 z-30 flex items-center px-4 pb-2"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <button
          onClick={() => navigate(-1)}
          aria-label="Retour"
          className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-card"
        >
          <ArrowLeft size={18} />
        </button>
      </header>

      <RealsViewer startPostId={postId} />
    </div>
  );
};

export default ExploreFeedPage;
