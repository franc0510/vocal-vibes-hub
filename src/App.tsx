import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import FeedPage from "@/pages/FeedPage";
import SearchPage from "@/pages/SearchPage";
import UserProfilePage from "@/pages/UserProfilePage";
import PostPage from "@/pages/PostPage";
import RecordPage from "@/pages/RecordPage";
import ProfilePage from "@/pages/ProfilePage";
import MessagesPage from "@/pages/MessagesPage";
import AuthPage from "@/pages/AuthPage";
import SettingsPage from "@/pages/SettingsPage";
import GroupsPage from "@/pages/GroupsPage";
import WeeklyPage from "@/pages/WeeklyPage";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useDailyNotification } from "@/hooks/useDailyNotification";
import { useWeeklyNotifications } from "@/hooks/useWeeklyNotifications";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useEffect } from "react";
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
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  useDailyNotification();
  useWeeklyNotifications();
  useRealtimeNotifications();

  // Handle OAuth deep link callback on native platforms
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleAppUrlOpen = async ({ url }: { url: string }) => {
      console.log("🔗 App URL opened:", url);
      
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
              // Force a page reload to update the auth state
              window.location.href = "/";
            }
          } catch (err) {
            console.error("❌ Failed to set session:", err);
          }
        }
      }
    };

    CapApp.addListener("appUrlOpen", handleAppUrlOpen);
    return () => {
      CapApp.removeAllListeners();
    };
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-background" style={{ height: "100dvh" }}>
      <div className="w-full flex-1 overflow-auto min-h-0">
        <div className="max-w-lg w-full mx-auto h-full">
          <Routes>
            <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
            <Route path="/" element={<ProtectedRoute><FeedPage /></ProtectedRoute>} />
            <Route path="/record" element={<ProtectedRoute><RecordPage /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
            <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
            <Route path="/user/:userId" element={<ProtectedRoute><UserProfilePage /></ProtectedRoute>} />
            <Route path="/post/:postId" element={<ProtectedRoute><PostPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
            <Route path="/weekly" element={<ProtectedRoute><WeeklyPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
