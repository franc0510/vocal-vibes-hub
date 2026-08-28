import { Play, Trash2 } from "lucide-react";

export interface TilePost {
  id: string;
  title: string;
  duration: number;
  illustration_cover_url?: string | null;
  image_url?: string | null;
}

interface PostTileProps {
  post: TilePost;
  /** Falls back to the author's avatar when the anecdote carries no picture. */
  avatarUrl?: string | null;
  /** Initials, drawn when there is no picture at all. */
  initials?: string;
  onSelect: () => void;
  /** Shown only where deleting makes sense — one's own profile. */
  onDelete?: () => void;
}

const formatDuration = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

/**
 * One anecdote in a grid.
 *
 * Explore, one's own profile and someone else's each drew their own tile, and
 * only Explore ever showed a picture — the other two printed a play icon on
 * grey, so a wall of anecdotes looked identical. This is the one tile they all
 * use now, and it takes the best picture available: the generated panel first,
 * then the photo attached to the anecdote, then the author's avatar.
 */
const PostTile = ({ post, avatarUrl, initials = "U", onSelect, onDelete }: PostTileProps) => {
  const picture = post.illustration_cover_url || post.image_url || avatarUrl || null;

  return (
    <div className="relative aspect-square">
      <button
        onClick={onSelect}
        className={`absolute inset-0 rounded-xl overflow-hidden group ${
          picture ? "" : "bg-card border border-border/30 flex flex-col items-center justify-center p-2"
        }`}
      >
        {picture ? (
          <>
            <img
              src={picture}
              alt=""
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover transition-transform group-active:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            {/* Marks an illustrated anecdote: this tile is a story, not a still. */}
            {post.illustration_cover_url && (
              <Play size={13} className="absolute top-2 left-2 text-white drop-shadow fill-white" />
            )}
            <div className="absolute inset-x-0 bottom-0 p-1.5 text-left">
              <p className="text-[10px] text-white font-medium line-clamp-2 leading-tight drop-shadow">
                {post.title}
              </p>
              <p className="text-[9px] text-white/75">{formatDuration(post.duration)}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center mb-1 text-[10px] font-bold text-primary-foreground">
              {initials}
            </div>
            <p className="text-[10px] text-foreground font-medium text-center line-clamp-2 leading-tight">
              {post.title}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{formatDuration(post.duration)}</p>
          </>
        )}
      </button>

      {onDelete && (
        <button
          onClick={(e) => {
            // The tile underneath opens the anecdote; deleting must not do both.
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Supprimer « ${post.title} »`}
          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 flex items-center justify-center text-muted-foreground active:text-destructive"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};

export default PostTile;
