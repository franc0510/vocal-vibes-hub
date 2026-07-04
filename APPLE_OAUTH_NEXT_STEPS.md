# ✅ APPLE OAUTH CONFIGURATION - WHAT YOU NEED TO DO

## **Current Status**
- ✅ Code is ready (AuthPage.tsx + handleAppleSignIn)
- ✅ Button "Continue with Apple" is in UI
- ✅ Capacitor iOS setup done
- ❌ Environment variables NOT configured yet
- ❌ Apple Developer account setup NOT done yet
- ❌ Supabase Apple provider NOT configured yet

---

## **3 Things Missing**

### **1️⃣ Environment Variables (.env.local)**

File created: `.env.local`

**Action**: Edit it with YOUR Supabase credentials
```bash
nano .env.local
# OR
open -a TextEdit .env.local
```

Replace:
```
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_ANON_PUBLIC_KEY
```

**Where to find these?**
1. Go to https://app.supabase.com
2. Select your VocMe project
3. Settings → API
4. Copy:
   - **Project URL** → paste into `VITE_SUPABASE_URL`
   - **anon (public)** key → paste into `VITE_SUPABASE_PUBLISHABLE_KEY`

---

### **2️⃣ Apple Developer Account Setup**

**What you need:**
1. Apple Developer Account (https://developer.apple.com)
2. Team ID (your account number)
3. Create App ID for `com.vocme.app` with "Sign in with Apple" capability
4. Create Service ID for `com.vocme.web`
5. Generate Private Key (.p8 file) from App Store Connect API Keys

**Documents to help:**
- See `APPLE_OAUTH_SETUP_GUIDE.md` (detailed 7-step guide)
- See `APPLE_OAUTH_QUICK_5MIN.md` (quick 5-min checklist)

---

### **3️⃣ Supabase - Enable Apple Provider**

Once you have the credentials from #2:

1. Go to https://app.supabase.com → Your Project
2. Authentication → Providers → **Apple**
3. Fill in:
   - **Service ID**: `com.vocme.web`
   - **Key ID**: (from Apple Developer → Keys)
   - **Team ID**: (from your Apple Developer account)
   - **Private Key**: (paste content of .p8 file)
4. **Enable** the provider
5. **Save**

Also check:
- **Project Settings → API → Authorization → Callback URLs**
- Make sure these are present:
  - `capacitor://localhost` (for native iOS)
  - `http://localhost:5173` (for web dev)

---

## **Xcode Configuration (Already mostly done)**

In `ios/App/App.xcodeproj`:

✅ Already configured:
- Capacitor framework

❌ You still need:
1. **Signing & Capabilities** → "+ Capability" → "Sign in with Apple"
2. **Info** → URL Types → Add:
   - Identifier: `capacitor`
   - URL Schemes: `capacitor`
   - Role: `Editor`

---

## **Test When Ready**

```bash
# After configuring everything above:

# 1. Build web
npm run build

# 2. Sync iOS
npx cap sync ios

# 3. Open Xcode
npx cap open ios

# 4. Run on device/simulator (Cmd+R)

# 5. Click "Continue with Apple" button
# 6. Accept EULA
# 7. Sign in with your Apple ID
# 8. Should create user and redirect to home page
```

---

## **Troubleshooting**

If you get errors, see the troubleshooting section in:
- `APPLE_OAUTH_SETUP_GUIDE.md` → ÉTAPE 7

Common issues:
- "Invalid redirect URI" → Check Callback URLs match
- "Invalid client_id" → Check Service ID exactly equals `com.vocme.web`
- "The operation couldn't be completed" → Regenerate .p8 key
- App crashes → Add "Sign in with Apple" capability in Xcode

---

## **What I Did For You**

✅ Created `handleAppleSignIn()` function in AuthPage.tsx
✅ Added "Continue with Apple" button to UI
✅ Integrated Capacitor Browser for OAuth
✅ Created `.env.local` file (you fill in values)
✅ Created detailed setup guides (APPLE_OAUTH_SETUP_GUIDE.md)
✅ Created quick checklist (APPLE_OAUTH_QUICK_5MIN.md)
✅ Created check script (check-apple-oauth.sh)

---

## **ORDER OF OPERATIONS**

1. ✅ Fill in `.env.local` with your Supabase credentials
2. ✅ Create Apple Developer setup (App ID + Service ID + Private Key)
3. ✅ Enable Apple provider in Supabase
4. ✅ Add Sign in with Apple capability in Xcode
5. ✅ Build + Sync + Test

Once done, Apple OAuth will work! 🍎

---

## **Files Created/Modified**

New files:
- `.env.local` (fill with your credentials)
- `.env.local.example` (template)
- `APPLE_OAUTH_SETUP_GUIDE.md` (detailed guide)
- `APPLE_OAUTH_QUICK_5MIN.md` (quick checklist)
- `check-apple-oauth.sh` (status check script)

Modified:
- `src/pages/AuthPage.tsx` (added `handleAppleSignIn()` + button)

---

**Ready? Start with filling `.env.local`! 🚀**
