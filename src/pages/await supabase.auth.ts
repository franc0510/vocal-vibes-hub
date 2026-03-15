await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: window.location.origin } // ou l'URL exacte que tu as configurée
});
