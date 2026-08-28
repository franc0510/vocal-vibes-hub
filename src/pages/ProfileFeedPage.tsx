import { ArrowLeft } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import RealsViewer from "@/components/RealsViewer";

/**
 * One person's anecdotes, full screen and scrollable.
 *
 * Tapping a tile on a profile used to open a small card and stop there. This
 * keeps the journey going through that person's anecdotes only — the same
 * viewer as the feed, scoped to them, starting where the reader tapped.
 */
const ProfileFeedPage = () => {
  const { userId, postId } = useParams();
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

      <RealsViewer filterUserId={userId} startPostId={postId} />
    </div>
  );
};

export default ProfileFeedPage;
