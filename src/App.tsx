import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import FeedPage from "@/pages/FeedPage";
import SearchPage from "@/pages/SearchPage";
import UserProfilePage from "@/pages/UserProfilePage";
import PostPage from "@/pages/PostPage";
import ExploreFeedPage from "@/pages/ExploreFeedPage";
import ProfileFeedPage from "@/pages/ProfileFeedPage";
import BlockedUsersPage from "@/pages/BlockedUsersPage";
import RecordPage from "@/pages/RecordPage";
import ProfilePage from "@/pages/ProfilePage";
import MessagesPage from "@/pages/MessagesPage";
import AuthPage from "@/pages/AuthPage";
import SettingsPage from "@/pages/SettingsPage";
import GroupsPage from "@/pages/GroupsPage";
import WeeklyPage from "@/pages/WeeklyPage";
import CompetitionsPage from "@/pages/CompetitionsPage";
import CompetitionPage from "@/pages/CompetitionPage";
import CompetitionEditPage from "@/pages/CompetitionEditPage";
import NotFound from "./pages/NotFound";
import JoinChallengePage from "@/pages/JoinChallengePage";
import ErrorBoundary from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useDailyNotification } from "@/hooks/useDailyNotification";
import { useWeeklyNotifications } from "@/hooks/useWeeklyNotifications";
import { useCompetitionDayNotifications } from "@/hooks/useCompetitionDayNotifications";
import { useStoryIllustrationNotifications } from "@/hooks/useStoryIllustrationNotifications";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useEffect } from "react";
import { takePendingInvite } from "@/lib/pendingInvite";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    // Une invitation en attente reprend la main : sans ça, celui qui vient de
    // créer son compte pour rejoindre un défi atterrissait sur le fil, et
    // devait redemander le code à celui qui l'avait invité.
    const invite = takePendingInvite();
    return <Navigate to={invite ? `/join/${invite}` : "/"} replace />;
  }
  return <>{children}</>;
};

const AppRoutes = () => {
  const navigate = useNavigate();

  useDailyNotification();
  useWeeklyNotifications();
  useCompetitionDayNotifications();
  useStoryIllustrationNotifications();
  useRealtimeNotifications();
  usePushRegistration();

  // Handle OAuth deep link callback on native platforms
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleAppUrlOpen = async ({ url }: { url: string }) => {
      console.log("🔗 App URL opened:", url);

      /**
       * Une invitation, et non un retour d'authentification.
       *
       * Ce gestionnaire ne regardait QUE le fragment `#` : tout lien profond
       * portant un chemin — `vocme://join/ABC123` — était reçu puis ignoré en
       * silence. On le traite en premier, avant même de fermer le navigateur
       * intégré, parce qu'aucun navigateur n'est ouvert dans ce cas.
       */
      const invite = url.match(/^vocme:\/\/join\/([A-Za-z0-9]+)/i);
      if (invite) {
        navigate(`/join/${invite[1].toUpperCase()}`);
        return;
      }

      // Close the in-app browser
      try { await Browser.close(); } catch {}

      // Extract tokens from the URL hash
      const hashIndex = url.indexOf("#");
      if (hashIndex >= 0) {
        const fragment = url.substring(hashIndex + 1);
        const params = new URLSearchParams(fragment);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        
        console.log("🔑 Tokens found:", !!accessToken, !!refreshToken);
        
        if (accessToken && refreshToken) {
          try {
            const { data, error } = await supabase.auth.setSession({ 
              access_token: accessToken, 
              refresh_token: refreshToken 
            });
            
            if (error) {
              console.error("❌ Session error:", error);
            } else {
              console.log("✅ Session set successfully:", data.user?.id);
              // Rechargement complet pour rafraîchir l'état d'authentification.
              // Une invitation retenue survit, elle, dans `localStorage` — et
              // c'est ici qu'elle reprend la main, sinon le détour par Safari
              // la perdrait définitivement.
              const pending = takePendingInvite();
              window.location.href = pending ? `/join/${pending}` : "/";
            }
          } catch (err) {
            console.error("❌ Failed to set session:", err);
          }
        }
      }
    };

    // On garde la poignée pour ne retirer QUE cet écouteur : l'ancien
    // `removeAllListeners()` supprimait aussi celui de `nativeAuthService`,
    // qui attend le retour d'authentification.
    let handle: { remove: () => void } | undefined;
    CapApp.addListener("appUrlOpen", handleAppUrlOpen).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [navigate]);

  // `w-full` et non `w-screen` : `100vw` peut dépasser la largeur réellement
  // visible et suffit à faire partir toute l'application de travers.
  return (
    <div className="w-full h-screen flex flex-col bg-background overflow-x-hidden" style={{ height: "100dvh" }}>
      {/* `overflow-auto` portait sur LES DEUX axes : le moindre débordement,
          n'importe où, rendait l'application scrollable latéralement. On coupe
          ici — et on corrige les débordements à la source, pour ne pas se
          contenter de masquer le prochain. */}
      <div className="w-full flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        <div className="max-w-lg w-full mx-auto h-full">
          {/* Un écran qui tombe doit le DIRE. Sans cette barrière, React
              démonte tout l'arbre et il ne reste qu'une page blanche, sans le
              moindre indice sur ce qui a cassé. */}
          <ErrorBoundary>
          <Routes>
            <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
            <Route path="/record" element={<ProtectedRoute><RecordPage /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
            <Route path="/user/:userId" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
            <Route path="/post/:postId" element={<ProtectedRoute><PostPage /></ProtectedRoute>} />
            <Route path="/vocme/:postId" element={<ProtectedRoute><ExploreFeedPage /></ProtectedRoute>} />
            <Route path="/user/:userId/vocme/:postId" element={<ProtectedRoute><ProfileFeedPage /></ProtectedRoute>} />
            <Route path="/settings/blocked" element={<ProtectedRoute><BlockedUsersPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
            {/* Hors de ProtectedRoute, délibérément : quelqu'un qui reçoit une
                invitation n'a pas encore de compte, et doit voir à quoi on
                l'invite avant de s'inscrire. La page gère elle-même la
                connexion, et retient le code au passage. */}
            <Route path="/join/:code" element={<JoinChallengePage />} />
            <Route path="/competitions" element={<ProtectedRoute><CompetitionsPage /></ProtectedRoute>} />
            {/* Avant /competitions/:id, sinon « new » serait pris pour un identifiant. */}
            <Route path="/competitions/new" element={<ProtectedRoute><CompetitionEditPage /></ProtectedRoute>} />
            <Route path="/competitions/:competitionId" element={<ProtectedRoute><CompetitionPage /></ProtectedRoute>} />
            <Route path="/competitions/:competitionId/edit" element={<ProtectedRoute><CompetitionEditPage /></ProtectedRoute>} />
            {/* Weekly quitte la nav mais garde sa route : les votes déjà posés
                dans vocme_votes ne sont pas perdus, seulement moins visibles,
                le temps de le recréer comme compétition publique permanente. */}
            <Route path="/weekly" element={<ProtectedRoute><WeeklyPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </div>
      </div>
      <ProtectedNavWrapper />
    </div>
  );
};

const ProtectedNavWrapper = () => {
  const { user } = useAuth();
  if (!user) return null;
  return <BottomNav />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
