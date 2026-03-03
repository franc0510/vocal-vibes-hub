import { type VoicePost } from "@/lib/mockData";

interface CategoryBadgeProps {
  category: VoicePost["category"];
}

const categoryStyles: Record<VoicePost["category"], { label: string; className: string }> = {
  life: { label: "Life", className: "bg-primary/15 text-primary" },
  anecdote: { label: "Anecdote", className: "bg-accent/15 text-accent" },
  podcast: { label: "Podcast", className: "bg-teal/15 text-teal" },
};

const CategoryBadge = ({ category }: CategoryBadgeProps) => {
  const style = categoryStyles[category];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
};

export default CategoryBadge;
