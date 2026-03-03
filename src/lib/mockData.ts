export interface VoicePost {
  id: string;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  category: "life" | "anecdote" | "podcast";
  title: string;
  duration: number; // seconds
  waveform: number[]; // normalized 0-1
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  createdAt: string;
  isPlaying?: boolean;
}

export const CATEGORIES = [
  { id: "all", label: "Tout", icon: "🎵" },
  { id: "life", label: "Life", icon: "✨" },
  { id: "anecdote", label: "Anecdote", icon: "💬" },
  { id: "podcast", label: "Podcast", icon: "🎙️" },
] as const;

const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

export const mockPosts: VoicePost[] = [
  {
    id: "1",
    author: { name: "Léa Martin", username: "@leamartin", avatar: "LM" },
    category: "life",
    title: "Mon déménagement à Paris 🏙️",
    duration: 47,
    waveform: generateWaveform(32),
    likes: 234,
    comments: 18,
    shares: 5,
    isLiked: false,
    createdAt: "Il y a 2h",
  },
  {
    id: "2",
    author: { name: "Karim Benzar", username: "@kbenzar", avatar: "KB" },
    category: "anecdote",
    title: "La fois où j'ai rencontré Zidane au supermarché 😂",
    duration: 93,
    waveform: generateWaveform(32),
    likes: 1823,
    comments: 142,
    shares: 89,
    isLiked: true,
    createdAt: "Il y a 5h",
  },
  {
    id: "3",
    author: { name: "Sophie Dubois", username: "@sophied", avatar: "SD" },
    category: "podcast",
    title: "Ep. 12 — L'intelligence artificielle et la créativité",
    duration: 342,
    waveform: generateWaveform(32),
    likes: 567,
    comments: 45,
    shares: 32,
    isLiked: false,
    createdAt: "Il y a 8h",
  },
  {
    id: "4",
    author: { name: "Lucas Petit", username: "@lucasp", avatar: "LP" },
    category: "life",
    title: "Premier jour de stage — je stresse 😬",
    duration: 28,
    waveform: generateWaveform(32),
    likes: 89,
    comments: 12,
    shares: 2,
    isLiked: false,
    createdAt: "Il y a 12h",
  },
  {
    id: "5",
    author: { name: "Amina Youssef", username: "@aminay", avatar: "AY" },
    category: "anecdote",
    title: "Comment j'ai failli rater mon avion pour le Japon ✈️",
    duration: 156,
    waveform: generateWaveform(32),
    likes: 2341,
    comments: 203,
    shares: 156,
    isLiked: true,
    createdAt: "Il y a 1j",
  },
  {
    id: "6",
    author: { name: "Thomas Roux", username: "@tomroux", avatar: "TR" },
    category: "podcast",
    title: "Débat : Faut-il quitter les réseaux sociaux ?",
    duration: 480,
    waveform: generateWaveform(32),
    likes: 891,
    comments: 76,
    shares: 45,
    isLiked: false,
    createdAt: "Il y a 1j",
  },
];

export const mockReals: VoicePost[] = [
  {
    id: "r1",
    author: { name: "Jade Chen", username: "@jadechen", avatar: "JC" },
    category: "life",
    title: "Le bruit de la pluie ce matin 🌧️",
    duration: 15,
    waveform: generateWaveform(32),
    likes: 4521,
    comments: 89,
    shares: 234,
    isLiked: false,
    createdAt: "Il y a 30min",
  },
  {
    id: "r2",
    author: { name: "Omar Diallo", username: "@omardiallo", avatar: "OD" },
    category: "anecdote",
    title: "Mon voisin chante sous la douche 😂🎤",
    duration: 12,
    waveform: generateWaveform(32),
    likes: 8923,
    comments: 456,
    shares: 678,
    isLiked: true,
    createdAt: "Il y a 1h",
  },
  {
    id: "r3",
    author: { name: "Clara Fontaine", username: "@claraf", avatar: "CF" },
    category: "life",
    title: "ASMR cuisine — découpe de légumes 🥕",
    duration: 18,
    waveform: generateWaveform(32),
    likes: 3456,
    comments: 67,
    shares: 123,
    isLiked: false,
    createdAt: "Il y a 3h",
  },
];
