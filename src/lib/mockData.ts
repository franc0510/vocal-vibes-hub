export interface VoicePost {
  id: string;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  title: string;
  duration: number;
  waveform: number[];
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  createdAt: string;
  isPlaying?: boolean;
  reactions: Record<string, number>;
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
    title: "Spilled my coffee on my boss this morning 😂☕",
    duration: 38,
    waveform: generateWaveform(32),
    likes: 234,
    comments: 18,
    shares: 5,
    isLiked: false,
    createdAt: "2h ago",
    reactions: randomReactions(),
  },
  {
    id: "2",
    author: { name: "Karim Benzar", username: "@kbenzar", avatar: "KB" },
    title: "The time I met Zidane at the supermarket 😂",
    duration: 44,
    waveform: generateWaveform(32),
    likes: 1823,
    comments: 142,
    shares: 89,
    isLiked: true,
    createdAt: "5h ago",
    reactions: randomReactions(),
  },
  {
    id: "3",
    author: { name: "Sophie Dubois", username: "@sophied", avatar: "SD" },
    title: "My neighbor mistook me for his wife… 🫣",
    duration: 29,
    waveform: generateWaveform(32),
    likes: 567,
    comments: 45,
    shares: 32,
    isLiked: false,
    createdAt: "8h ago",
    reactions: randomReactions(),
  },
  {
    id: "4",
    author: { name: "Lucas Petit", username: "@lucasp", avatar: "LP" },
    title: "First day of internship — I called the director 'dad' 😬",
    duration: 28,
    waveform: generateWaveform(32),
    likes: 89,
    comments: 12,
    shares: 2,
    isLiked: false,
    createdAt: "12h ago",
    reactions: randomReactions(),
  },
  {
    id: "5",
    author: { name: "Amina Youssef", username: "@aminay", avatar: "AY" },
    title: "How I almost missed my flight to Japan ✈️",
    duration: 45,
    waveform: generateWaveform(32),
    likes: 2341,
    comments: 203,
    shares: 156,
    isLiked: true,
    createdAt: "1d ago",
    reactions: randomReactions(),
  },
  {
    id: "6",
    author: { name: "Thomas Roux", username: "@tomroux", avatar: "TR" },
    title: "The delivery guy brought 50 pizzas to my door by mistake 🍕",
    duration: 41,
    waveform: generateWaveform(32),
    likes: 891,
    comments: 76,
    shares: 45,
    isLiked: false,
    createdAt: "1d ago",
    reactions: randomReactions(),
  },
];

export const mockReals: VoicePost[] = [
  {
    id: "r1",
    author: { name: "Jade Chen", username: "@jadechen", avatar: "JC" },
    title: "The noise my cat makes when it sees a bird 🐱",
    duration: 15,
    waveform: generateWaveform(32),
    likes: 4521,
    comments: 89,
    shares: 234,
    isLiked: false,
    createdAt: "30m ago",
    reactions: randomReactions(),
  },
  {
    id: "r2",
    author: { name: "Omar Diallo", username: "@omardiallo", avatar: "OD" },
    title: "My neighbor sings in the shower 😂🎤",
    duration: 12,
    waveform: generateWaveform(32),
    likes: 8923,
    comments: 456,
    shares: 678,
    isLiked: true,
    createdAt: "1h ago",
    reactions: randomReactions(),
  },
  {
    id: "r3",
    author: { name: "Clara Fontaine", username: "@claraf", avatar: "CF" },
    title: "Walked straight into a glass door in front of everyone 💀",
    duration: 18,
    waveform: generateWaveform(32),
    likes: 3456,
    comments: 67,
    shares: 123,
    isLiked: false,
    createdAt: "3h ago",
    reactions: randomReactions(),
  },
];
