# 🍎 Configure Apple OAuth Sign in pour VocMe

## **ÉTAPE 1 : Apple Developer Account Setup**

### 1A. Créer l'App ID avec Sign in with Apple

1. Allez sur **Apple Developer** → [https://developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list)
2. Cliquez **"+" → Identifiers → App IDs**
3. Sélectionnez **App** (pas Wildcard)
4. Remplissez :
   - Description : `VocMe`
   - Bundle ID : `com.vocme.app` (correspond à `capacitor.config.ts`)
5. Dans **Capabilities**, cochez **"Sign in with Apple"**
6. Cliquez **Register**

### 1B. Créer Service ID (pour web/OAuth)

1. **"+" → Identifiers → Services IDs**
2. Description : `VocMe Web Service`
3. Identifier : `com.vocme.web` (important - Supabase l'utilise)
4. **Configure** → Return URLs :
   - `https://YOUR_SUPABASE_URL.supabase.co/auth/v1/callback`
   - Exemple : `https://abcdefgh.supabase.co/auth/v1/callback`
5. Cliquez **Continue → Register**

### 1C. Générer Private Key pour Supabase

1. Allez **Keys** → **All** (à gauche)
2. Cliquez **"+" → App Store Connect API Key**
3. Sélectionnez **Admin**
4. Cliquez **Generate**
5. Téléchargez `.p8` file (sauvegarde-le sécurisé)
6. Copie :
   - **Key ID** (ex: `ABC123XYZ`)
   - **Team ID** (sur ton Apple Developer Account)

---

## **ÉTAPE 2 : Configurer Supabase Dashboard**

### 2A. Ajouter Apple Provider

1. Allez **Supabase Dashboard** → [https://app.supabase.com](https://app.supabase.com)
2. Sélectionne ton projet **VocMe**
3. **Authentication → Providers → Apple**
4. Remplis :
   - **Service ID** : `com.vocme.web` (depuis 1B)
   - **Key ID** : `ABC123XYZ` (depuis 1C)
   - **Team ID** : Ton Team ID Apple
   - **Private Key** : Colle le contenu du `.p8` (ou copie-colle depuis le fichier)

5. **Enable** le provider
6. **Save**

### 2B. Vérifier OAuth Callback URL

1. **Project Settings → API → Authorization → Callback URLs**
2. Ajoute si absent :
   - `capacitor://localhost` (pour Capacitor iOS native)
   - `http://localhost:3000/auth/callback` (pour web dev local)
   - `http://localhost:5173/auth/callback` (Vite dev server)

---

## **ÉTAPE 3 : Xcode iOS Configuration**

### 3A. Ajouter Sign in with Apple Capability

1. Ouvre **Xcode** → `ios/App/App.xcodeproj`
2. Sélectionne **App** (left sidebar)
3. **Signing & Capabilities** tab
4. Clique **"+ Capability" → "Sign in with Apple"**
5. Assure-toi que :
   - **Team** = Ton Apple Developer Team
   - **Bundle Identifier** = `com.vocme.app`

### 3B. Ajouter URL Schemes

1. Toujours dans **Signing & Capabilities**
2. Clique **"+ Capability" → "Associated Domains"**
3. Ajoute domaines (applinks + webcredentials) :
   - `applinks:YOUR_SUPABASE_URL` (ex: `applinks:abcdefgh.supabase.co`)
   - `webcredentials:YOUR_SUPABASE_URL`

4. Ensuite, **Info tab** → URL Types → Ajoute :
   - **Identifier** : `capacitor`
   - **URL Schemes** : `capacitor`
   - **Role** : Editor

---

## **ÉTAPE 4 : Code Configuration (Déjà fait dans AuthPage.tsx)**

Ton code est déjà prêt :

```typescript
// AuthPage.tsx - handleAppleSignIn()
const handleAppleSignIn = async () => {
  if (!isLogin && !eulaAccepted) {
    setShowEULA(true);
    setPendingSignUp({ provider: "apple" });
    return;
  }
  try {
    if (Capacitor.isNativePlatform()) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: "capacitor://localhost",
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data?.url) {
        await Browser.open({ url: data.url, windowName: "_self" });
        Browser.addListener("browserFinished", () => {});
      }
    } else {
      // Web fallback
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    }
  } catch (err: any) {
    console.error("Apple OAuth error:", err);
    toast.error(err.message || "Apple sign-in failed");
  }
};
```

---

## **ÉTAPE 5 : Variables d'Environnement (.env.local)**

Crée `.env.local` à la racine du projet :

```env
# Supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_KEY

# Note: Ne mets JAMAIS la secret key en frontend - elle est publique
```

**Où trouver ces valeurs ?**
- Supabase Dashboard → **Settings → API → Project URL + anon public key**

---

## **ÉTAPE 6 : Test Local**

### Web Dev Server
```bash
npm run dev
# http://localhost:5173 → Login → Click "Continue with Apple"
```

### iOS Simulator/Device
```bash
# D'abord build web
npm run build

# Sync iOS
npx cap sync ios

# Ouvre Xcode
npx cap open ios

# Run on simulator/device
# Cmd + R (ou Play button)
```

---

## **ÉTAPE 7 : Troubleshooting**

### "Invalid redirect URI"
❌ **Problème** : Callback URL ne correspond pas
✅ **Solution** :
- Vérifier `capacitor://localhost` dans Supabase
- Sur device réel : ajouter aussi un vrai domaine (pas localhost)

### "Invalid client_id"
❌ **Problème** : Service ID incorrect ou Team ID mauvais
✅ **Solution** :
- Vérifier Service ID = `com.vocme.web`
- Vérifier Team ID exact

### "The operation couldn't be completed"
❌ **Problème** : Private key `.p8` incorrecte ou expirée
✅ **Solution** :
- Régénère une nouvelle key (Apple Developer Account → Keys)
- Copie-colle le fichier complet en Supabase

### iOS App crashes au login Apple
❌ **Problème** : Sign in with Apple capability manquante
✅ **Solution** :
- Xcode → Signing & Capabilities → "+ Capability" → "Sign in with Apple"
- Clean Build Folder (Cmd + Shift + K)
- Rebuild

### Browser.open() ne fait rien
❌ **Problème** : Capacitor Browser plugin non configuré
✅ **Solution** :
- Vérifier import : `import { Browser } from "@capacitor/browser";`
- Run `npx cap sync ios` pour re-sync plugins
- Rebuild

---

## **CHECKLIST FINALE**

- [ ] Apple Developer Account créé + App ID registered
- [ ] Service ID créé (`com.vocme.web`)
- [ ] Private Key généré + sauvegardé sécurisé
- [ ] Supabase → Apple Provider configured
- [ ] Callback URLs ajoutées dans Supabase
- [ ] Xcode → Sign in with Apple capability ON
- [ ] Xcode → URL Schemes configurés (`capacitor`)
- [ ] `.env.local` créé avec Supabase vars
- [ ] `npm run build` réussit
- [ ] `npx cap sync ios` réussit
- [ ] App compilé + runnable sur device
- [ ] Test sur Simulator ✅
- [ ] Test sur device réel 📱

---

## **Pour Toi**

Dis-moi pour chaque étape :
1. ✅ ou ❌ Apple Developer setup (as-tu l'App ID + Service ID + Private Key ?)
2. ✅ ou ❌ Supabase Apple provider configuré ?
3. ✅ ou ❌ Xcode capabilities ajoutées ?
4. ✅ ou ❌ Quels erreurs tu vois exactement ?

Je peux t'aider à debugger l'erreur spécifique ! 🍎
