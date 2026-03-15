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
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useDailyNotification } from "@/hooks/useDailyNotification";

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
  return (
    <div className="w-screen h-screen flex flex-col bg-background" style={{ height: "100dvh" }}>
      {/* Status bar spacer - même couleur que l'app */}
      <div className="w-full bg-background shrink-0" style={{ height: "env(safe-area-inset-top, 0px)" }} />
      
      <div className="w-full flex-1 overflow-auto min-h-0">
        <div className="max-w-lg w-full mx-auto">
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </div>
      <div className="w-full">
        <ProtectedNavWrapper />
      </div>
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
