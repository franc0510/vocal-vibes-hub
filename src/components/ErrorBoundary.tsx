import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Ce qui s'affiche quand un écran tombe.
 *
 * Sans elle, React démonte tout l'arbre au premier rendu qui lève, et il ne
 * reste qu'une page BLANCHE : ni message, ni bouton, ni indice. C'est ce qu'a
 * vu le premier testeur en ouvrant une anecdote de défi, et le symptôme ne
 * disait rien de la cause — il a fallu la retrouver dans le code.
 *
 * Une erreur de rendu reste une erreur : cette barrière ne la répare pas. Elle
 * fait deux choses que l'écran blanc ne faisait pas — dire que quelque chose a
 * cassé, et offrir un chemin pour repartir plutôt que de tuer l'application.
 *
 * Volontairement une classe : React n'offre pas d'équivalent en composant de
 * fonction. C'est la seule de ce dépôt, et c'est la raison.
 */

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // La console reste la seule trace : ce projet n'a pas de collecte
    // d'erreurs. Sans ce journal, une reproduction sur un vrai téléphone
    // n'apprendrait rien de plus qu'un écran blanc.
    console.error("💥 Écran en erreur :", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-foreground font-medium">This screen ran into a problem</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Nothing was lost. Reloading usually gets you moving again.
        </p>
        <button
          onClick={() => window.location.assign("/")}
          className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full gradient-red text-primary-foreground font-medium text-sm"
        >
          <RefreshCw size={15} /> Reload VocMe
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
