# 📋 Code Practices Guide - Vocal Vibes Hub

Ce document définit les bonnes pratiques de code pour le projet **Vocal Vibes Hub**, une application mobile iOS/web de partage de posts vocaux construite avec **React**, **TypeScript**, **Capacitor**, **Tailwind CSS** et **Supabase**.

---

## 📁 Structure du Projet

```
src/
├── components/          # Composants réutilisables (UI et business logic)
│   ├── ui/             # Composants shadcn/ui (non modifiables)
│   ├── BottomNav.tsx
│   ├── VoiceCard.tsx
│   └── ...
├── pages/              # Pages/routes principales (full screen)
├── hooks/              # Hooks personnalisés (data fetching, state logic)
├── contexts/           # Contextes React (Auth, Theme, etc.)
├── integrations/       # Services externes (Supabase, Lovable)
├── lib/                # Fonctions utilitaires (utils, mockData)
└── test/               # Tests unitaires et fixtures
```

---

## 🎯 Règles Générales

### 1. **Types et TypeScript**
- ✅ **Toujours** typer explicitement les variables, paramètres et retours
- ✅ Définir les interfaces/types au niveau du fichier ou dans un dossier `types/`
- ✅ Utiliser des types génériques pour les collections (`VoicePostWithAuthor[]`)
- ❌ Éviter `any` — préférer `unknown` avec type guards si nécessaire

```typescript
// ✅ BON
interface VoicePostWithAuthor {
  id: string;
  user_id: string;
  title: string;
  audio_url: string;
  duration: number;
  author: {
    name: string;
    username: string;
    avatar: string;
  };
  isLiked: boolean;
}

const posts: VoicePostWithAuthor[] = [];

// ❌ MAUVAIS
const posts: any[] = [];
```

### 2. **Nommage**
- **Composants** : PascalCase (ex: `VoiceCard`, `BottomNav`)
- **Hooks** : camelCase, préfixe `use` (ex: `useVoicePosts`, `useMicrophone`)
- **Fichiers** : PascalCase pour composants, camelCase pour fonctions/hooks
- **Variables/fonctions** : camelCase
- **Constantes** : UPPER_SNAKE_CASE (si réellement constantes)
- **Boolean variables** : préfixe `is`, `has`, `can` (ex: `isLiked`, `hasError`)

```typescript
// ✅ BON
const isLoading = true;
const handleLikePost = () => {};
const SUPABASE_MAX_RETRY = 3;

// ❌ MAUVAIS
const loading = true;
const like = () => {};
const MaxRetry = 3;
```

### 3. **Imports et Organisation**
- Grouper les imports dans cet ordre :
  1. Dépendances externes (React, libs)
  2. Composants/hooks internes
  3. Types/interfaces
  4. Assets/styles

```typescript
// ✅ BON
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import VoiceCard from "@/components/VoiceCard";
import { useVoicePosts } from "@/hooks/useVoicePosts";
import { VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { cn } from "@/lib/utils";
```

### 4. **Composants React**

#### Structure d'un composant
```typescript
// ✅ BON
import { FC, ReactNode } from "react";

interface MyComponentProps {
  title: string;
  onClose?: () => void;
  children?: ReactNode;
}

const MyComponent: FC<MyComponentProps> = ({ title, onClose, children }) => {
  const [state, setState] = useState(false);

  const handleAction = () => {
    // logique
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{title}</h1>
      {children}
      <button onClick={onClose}>Close</button>
    </div>
  );
};

export default MyComponent;
```

#### Props et Interfaces
- Toujours définir une interface `ComponentProps` explicite
- Utiliser `FC<ComponentProps>` (Functional Component)
- Destructurer les props plutôt que `props.x`
- Utiliser `?` pour les props optionnelles

```typescript
// ✅ BON
interface VoiceCardProps {
  post: VoicePostWithAuthor;
  onLike?: (postId: string) => Promise<void>;
  isLoading?: boolean;
}

const VoiceCard: FC<VoiceCardProps> = ({ post, onLike, isLoading = false }) => {
  // ...
};

// ❌ MAUVAIS
const VoiceCard = (props: any) => {
  return <div>{props.post.title}</div>;
};
```

### 5. **Hooks Personnalisés**

#### Structure
```typescript
// ✅ BON
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseVoicePostsReturn {
  posts: VoicePostWithAuthor[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useVoicePosts = (): UseVoicePostsReturn => {
  const [posts, setPosts] = useState<VoicePostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      // logique fetch
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  return { posts, loading, error, refetch: fetchPosts };
};
```

#### Points clés
- ✅ Toujours retourner une interface typée
- ✅ Fournir `loading`, `error`, et une fonction `refetch`
- ✅ Gérer les erreurs avec try-catch
- ✅ Nettoyer les effets (cleanup functions)

```typescript
// ✅ BON - avec cleanup
useEffect(() => {
  const subscription = supabase.on("*", handleChange).subscribe();
  
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

### 6. **Supabase et Data Fetching**

#### Appels Supabase
```typescript
// ✅ BON
const { data, error } = await supabase
  .from("voice_posts")
  .select("id, title, audio_url, created_at")
  .order("created_at", { ascending: false })
  .limit(10);

if (error) {
  console.error("Supabase error:", error);
  setError(error);
  return;
}

// ❌ MAUVAIS - pas de gestion d'erreur
const { data } = await supabase.from("voice_posts").select("*");
```

#### Utiliser les contextes pour l'auth
```typescript
// ✅ BON
import { useAuth } from "@/contexts/AuthContext";

const MyComponent = () => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" />;
  
  return <div>{user.email}</div>;
};
```

### 7. **Gestion d'État**

#### useState vs useContext
- **useState** : état local au composant
- **useContext** : état partagé (Auth, Theme)
- **TanStack Query** : cache de données serveur

```typescript
// ✅ Local state
const [isOpen, setIsOpen] = useState(false);

// ✅ Shared state
const { user } = useAuth();

// ✅ Server data with React Query
const { data: posts, isLoading } = useQuery({
  queryKey: ["posts"],
  queryFn: () => supabase.from("voice_posts").select("*"),
});
```

### 8. **Styles et Tailwind CSS**

#### Classe CSS
- ✅ Utiliser `cn()` pour les conditionnels
- ✅ Garder les classes groupées et lisibles
- ✅ Préférer les variables CSS pour les valeurs dynamiques

```typescript
// ✅ BON
import { cn } from "@/lib/utils";

const VoiceCard: FC<VoiceCardProps> = ({ post, isLiked }) => {
  return (
    <div className={cn(
      "p-4 rounded-lg border transition-all",
      isLiked ? "border-pink-500 bg-pink-50" : "border-gray-200"
    )}>
      {/* contenu */}
    </div>
  );
};

// ❌ MAUVAIS
<div className={isLiked ? "p-4 rounded-lg border border-pink-500 bg-pink-50" : "p-4 rounded-lg border border-gray-200"}>
```

#### Responsive Design
- Mobile-first : commencer avec les styles mobile
- Utiliser les breakpoints Tailwind (`md:`, `lg:`, etc.)
- Tester sur iPhone 12/14 (375px) et iPad

```typescript
// ✅ BON
<div className="w-full md:w-1/2 lg:w-1/3 px-4 md:px-6">
  <h1 className="text-sm md:text-base lg:text-lg">Title</h1>
</div>
```

### 9. **Gestion des Erreurs**

```typescript
// ✅ BON
try {
  const result = await supabase.from("posts").select("*");
  if (result.error) {
    throw new Error(`Supabase: ${result.error.message}`);
  }
  // process result.data
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("Failed to fetch posts:", message);
  setError(message);
  // notifier l'utilisateur (toast)
}

// ❌ MAUVAIS
const result = await supabase.from("posts").select("*");
const posts = result.data || [];
```

### 10. **Async/Await et Promises**

```typescript
// ✅ BON
const handleLike = async (postId: string) => {
  try {
    setIsLiking(true);
    await supabase.from("likes").insert({ post_id: postId, user_id });
    await refetch();
  } catch (error) {
    toast.error("Failed to like post");
  } finally {
    setIsLiking(false);
  }
};

// ❌ MAUVAIS - pas de try-catch, état pas géré
const handleLike = (postId: string) => {
  supabase.from("likes").insert({ post_id: postId, user_id });
};
```

### 11. **Tests et Accessibility**

#### Accessibility
- ✅ Ajouter `aria-label` sur les boutons icônes
- ✅ Utiliser des `<button>`, `<a>` ou role="button"
- ✅ Tester sur lecteur d'écran (VoiceOver sur iOS)

```typescript
// ✅ BON
<button
  aria-label="Like this post"
  onClick={handleLike}
  className="p-2 rounded hover:bg-gray-100"
>
  <Heart size={20} />
</button>

// ❌ MAUVAIS
<div onClick={handleLike} className="cursor-pointer">
  <Heart size={20} />
</div>
```

#### Tests
- Créer des tests dans `src/test/`
- Utiliser Vitest + React Testing Library
- Tester les hooks, composants critiques, et cas d'erreur

```typescript
// ✅ BON
import { render, screen } from "@testing-library/react";
import VoiceCard from "./VoiceCard";

test("displays post title", () => {
  const post = { id: "1", title: "Test Post", ... };
  render(<VoiceCard post={post} />);
  expect(screen.getByText("Test Post")).toBeInTheDocument();
});
```

---

## 🚀 Patterns Spécifiques au Projet

### Pattern: Protected Route
```typescript
// ✅ BON
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};
```

### Pattern: Page avec Bottom Navigation
- Chaque page doit respecter la hauteur safe-area
- Laisser de l'espace pour `BottomNav`
- Éviter les fixed headers (utiliser sticky ou relative)

```typescript
// ✅ BON
const FeedPage = () => {
  return (
    <div className="h-screen flex flex-col" style={{ height: "100dvh" }}>
      {/* Safe area spacer */}
      <div style={{ height: "env(safe-area-inset-top, 0px)" }} />
      
      <div className="flex-1 overflow-auto min-h-0">
        {/* Contenu scrollable */}
      </div>
      
      {/* BottomNav sera en bas avec safe-area */}
    </div>
  );
};
```

### Pattern: Loading et Error States
```typescript
// ✅ BON
const FeedPage = () => {
  const { posts, loading, error, refetch } = useVoicePosts();

  if (loading && !posts.length) return <LoadingSpinner />;
  if (error && !posts.length) return <ErrorBanner onRetry={refetch} />;

  return (
    <div>
      {posts.map(post => (
        <VoiceCard key={post.id} post={post} />
      ))}
    </div>
  );
};
```

---

## 🔍 Checklist avant un commit

- [ ] Code compiles sans warning
- [ ] TypeScript strict mode : pas d'erreurs
- [ ] Tous les `console.log()` supprimés (sauf debug intentionnel)
- [ ] Pas de `any` types
- [ ] Props correctement typées
- [ ] Gestion d'erreur présente (try-catch)
- [ ] State management clair (useState/useContext/TanStack Query)
- [ ] Styles Tailwind cohérents
- [ ] Pas d'API calls en dehors des hooks
- [ ] Composants réutilisables isolés
- [ ] Tests écrits pour logique critique
- [ ] Accessible : aria-labels, keyboard navigation

---

## 📚 Ressources

- [React Docs](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase Docs](https://supabase.com/docs)
- [Capacitor Docs](https://capacitorjs.com/docs)
- [shadcn/ui](https://ui.shadcn.com)

---

## 📝 Exemples Complets

### Exemple 1: Hook complet
```typescript
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Post {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface UsePostsReturn {
  posts: Post[];
  loading: boolean;
  error: Error | null;
  createPost: (title: string, content: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export const usePosts = (): UsePostsReturn => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPosts = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from("posts")
        .select("id, title, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setPosts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch posts"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createPost = useCallback(async (title: string, content: string) => {
    if (!user) throw new Error("User not authenticated");

    try {
      const { error } = await supabase.from("posts").insert({
        user_id: user.id,
        title,
        content,
      });

      if (error) throw error;
      await fetchPosts();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create post";
      throw new Error(message);
    }
  }, [user, fetchPosts]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, error, createPost, refetch: fetchPosts };
};
```

### Exemple 2: Composant avec props typées
```typescript
import { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const Card: FC<CardProps> = ({
  children,
  className,
  onClick,
  disabled = false,
}) => {
  return (
    <div
      onClick={() => !disabled && onClick?.()}
      className={cn(
        "p-4 rounded-lg border border-gray-200 transition-all",
        !disabled && "hover:shadow-md cursor-pointer",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </div>
  );
};

export default Card;
```

---

**Document créé pour Vocal Vibes Hub — Mise à jour le 22 Mars 2026**
