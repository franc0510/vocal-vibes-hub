export interface VoicePost {
  id: string;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  title: string;
  duration: number; // seconds, max 45
  waveform: number[]; // normalized 0-1
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  createdAt: string;
  isPlaying?: boolean;
  reactions: Record<string, number>; // emoji -> count
}

export const REACTION_EMOJIS = ["😂", "😱", "🔥", "💀", "❤️", "👏"] as const;

const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

const randomReactions = (): Record<string, number> => {
  const r: Record<string, number> = {};
  REACTION_EMOJIS.forEach((e) => {
    if (Math.random() > 0.4) r[e] = Math.floor(Math.random() * 200);
  });
  return r;
};

export const mockPosts: VoicePost[] = [
  {
    id: "1",
    author: { name: "Léa Martin", username: "@leamartin", avatar: "LM" },
    title: "J'ai renversé mon café sur mon boss ce matin 😂☕",
    duration: 38,
    waveform: generateWaveform(32),
    likes: 234,
    comments: 18,
    shares: 5,
    isLiked: false,
    createdAt: "Il y a 2h",
    reactions: randomReactions(),
  },
  {
    id: "2",
    author: { name: "Karim Benzar", username: "@kbenzar", avatar: "KB" },
    title: "La fois où j'ai rencontré Zidane au supermarché 😂",
    duration: 44,
    waveform: generateWaveform(32),
    likes: 1823,
    comments: 142,
    shares: 89,
    isLiked: true,
    createdAt: "Il y a 5h",
    reactions: randomReactions(),
  },
  {
    id: "3",
    author: { name: "Sophie Dubois", username: "@sophied", avatar: "SD" },
    title: "Mon voisin m'a confondu avec sa femme… 🫣",
    duration: 29,
    waveform: generateWaveform(32),
    likes: 567,
    comments: 45,
    shares: 32,
    isLiked: false,
    createdAt: "Il y a 8h",
    reactions: randomReactions(),
  },
  {
    id: "4",
    author: { name: "Lucas Petit", username: "@lucasp", avatar: "LP" },
    title: "Premier jour de stage — j'ai appelé le directeur 'papa' 😬",
    duration: 28,
    waveform: generateWaveform(32),
    likes: 89,
    comments: 12,
    shares: 2,
    isLiked: false,
    createdAt: "Il y a 12h",
    reactions: randomReactions(),
  },
  {
    id: "5",
    author: { name: "Amina Youssef", username: "@aminay", avatar: "AY" },
    title: "Comment j'ai failli rater mon avion pour le Japon ✈️",
    duration: 45,
    waveform: generateWaveform(32),
    likes: 2341,
    comments: 203,
    shares: 156,
    isLiked: true,
    createdAt: "Il y a 1j",
    reactions: randomReactions(),
  },
  {
    id: "6",
    author: { name: "Thomas Roux", username: "@tomroux", avatar: "TR" },
    title: "Le livreur a livré 50 pizzas chez moi par erreur 🍕",
    duration: 41,
    waveform: generateWaveform(32),
    likes: 891,
    comments: 76,
    shares: 45,
    isLiked: false,
    createdAt: "Il y a 1j",
    reactions: randomReactions(),
  },
];

export const mockReals: VoicePost[] = [
  {
    id: "r1",
    author: { name: "Jade Chen", username: "@jadechen", avatar: "JC" },
    title: "Le bruit que fait mon chat quand il voit un oiseau 🐱",
    duration: 15,
    waveform: generateWaveform(32),
    likes: 4521,
    comments: 89,
    shares: 234,
    isLiked: false,
    createdAt: "Il y a 30min",
    reactions: randomReactions(),
  },
  {
    id: "r2",
    author: { name: "Omar Diallo", username: "@omardiallo", avatar: "OD" },
    title: "Mon voisin chante sous la douche 😂🎤",
    duration: 12,
    waveform: generateWaveform(32),
    likes: 8923,
    comments: 456,
    shares: 678,
    isLiked: true,
    createdAt: "Il y a 1h",
    reactions: randomReactions(),
  },
  {
    id: "r3",
    author: { name: "Clara Fontaine", username: "@claraf", avatar: "CF" },
    title: "J'ai marché dans une porte vitrée devant tout le monde 💀",
    duration: 18,
    waveform: generateWaveform(32),
    likes: 3456,
    comments: 67,
    shares: 123,
    isLiked: false,
    createdAt: "Il y a 3h",
    reactions: randomReactions(),
  },
];
