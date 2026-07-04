# 🔍 Apple OAuth Diagnostic - Test Your Setup

## **Step 1: Check .env.local is loaded**

Run in terminal:
```bash
cd /Users/mac-FGILLO05/vocal-vibes-hub-1
npm run dev
```

Then open browser: http://localhost:5173

Open DevTools (F12) → Console:
```javascript
// Paste this to check env vars are loaded:
console.log("SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("SUPABASE_KEY:", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
```

**Expected output:**
```
SUPABASE_URL: https://xxxxx.supabase.co
SUPABASE_KEY: eyJhbG...
```

If you see `undefined`, your `.env.local` isn't configured yet.

---

## **Step 2: Check Supabase Connection**

In DevTools Console, paste:
```javascript
// This should NOT throw an error if Supabase is connected
import { supabase } from "@/integrations/supabase/client";
console.log("Supabase client:", supabase);
```

If this works, Supabase is connected.

---

## **Step 3: Check Apple Provider in Supabase**

1. Go to https://app.supabase.com → Your Project
2. Authentication → Providers
3. Look for "Apple" in the list
4. If it shows as **Disabled** (gray), you need to configure it
5. If it shows **Enabled** (green), you're good

---

## **Step 4: Check Apple OAuth on Web**

1. Go to http://localhost:5173/auth (login page)
2. You should see:
   - "Continue with Google" button ✅
   - "Continue with Apple" button (NEW)

3. Click "Continue with Apple"
   - On web, browser should redirect to Apple login page
   - If nothing happens, check console for errors (F12)

---

## **Step 5: Check iOS Setup**

```bash
# Build for iOS
npm run build
npx cap sync ios
npx cap open ios

# In Xcode:
# 1. Select "App" project → Signing & Capabilities
# 2. Look for "Sign in with Apple" capability - should be present
# 3. If not, click "+ Capability" and add it

# 4. Run on device/simulator (Cmd+R)
# 5. Go to login page and click "Continue with Apple"
```

---

## **Common Issues & Quick Fixes**

### ❌ "Cannot find module '@supabase/supabase-js'"
```bash
npm install
```

### ❌ "VITE_SUPABASE_URL is undefined"
Your `.env.local` is not configured.
```bash
# Edit .env.local with your credentials
nano .env.local
```

Then restart dev server (Ctrl+C, then `npm run dev`)

### ❌ "Invalid redirect URI" on Apple login
Supabase Apple provider isn't configured yet.
Go to Supabase Dashboard → Authentication → Providers → Apple
Configure with your Apple Developer credentials.

### ❌ Button exists but nothing happens when clicked
1. Check browser console (F12) for JavaScript errors
2. Make sure Supabase env vars are loaded (Step 1)
3. Make sure Apple provider is Enabled in Supabase

### ❌ App crashes on iOS when clicking Apple button
1. In Xcode, check **Signing & Capabilities** → "Sign in with Apple" is there
2. Clean Build Folder: **Product → Clean Build Folder** (Cmd+Shift+K)
3. Rebuild: **Cmd+B**

---

## **Verification Checklist**

- [ ] `.env.local` exists and has values
- [ ] `npm run dev` shows "Continue with Apple" button
- [ ] Supabase Apple provider shows as "Enabled"
- [ ] Clicking button on web does something (redirects or shows error)
- [ ] Xcode has "Sign in with Apple" capability
- [ ] iOS app builds without errors
- [ ] iOS app shows button
- [ ] Click Apple button → Opens Apple login (on device/simulator)

If ALL checks pass: ✅ **Apple OAuth is configured and working!**

---

## **Debug Mode**

To see detailed logs, add this to `src/pages/AuthPage.tsx`:

```typescript
const handleAppleSignIn = async () => {
  console.log("🍎 handleAppleSignIn called");
  console.log("isNativePlatform:", Capacitor.isNativePlatform());
  
  try {
    console.log("🍎 Attempting Apple OAuth...");
    
    if (Capacitor.isNativePlatform()) {
      console.log("🍎 Native platform - using skipBrowserRedirect");
      // ... rest of code
    } else {
      console.log("🍎 Web platform - using standard redirect");
      // ... rest of code
    }
  } catch (err: any) {
    console.error("❌ Apple OAuth error:", err);
    toast.error(err.message || "Apple sign-in failed");
  }
};
```

Then check console in Xcode debugger or browser DevTools.

---

**Questions? Check the detailed guides:**
- `APPLE_OAUTH_SETUP_GUIDE.md` - Full 7-step walkthrough
- `APPLE_OAUTH_QUICK_5MIN.md` - Quick checklist
- `APPLE_OAUTH_NEXT_STEPS.md` - Overview
