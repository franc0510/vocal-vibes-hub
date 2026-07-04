# Native OAuth Configuration Guide

## Issue: OAuth Redirects to Web Instead of App

The previous implementation used `Browser.open()` which opened Safari, taking users out of the app. This new implementation uses **in-app browser** with deeplinks to keep authentication within the app.

---

## Solution: Native OAuth with Deeplinks

### Architecture

```
User clicks "Sign in with Google/Apple"
        ↓
nativeAuthService.ts handles auth
        ↓
Opens in-app browser (SFSafariViewController on iOS)
        ↓
User authenticates with Google/Apple
        ↓
Supabase callback to deeplink: vocme://auth/callback
        ↓
Deeplink handled by Capacitor
        ↓
Session established
        ↓
User redirected to feed (still in app)
```

---

## Step 1: Configure Supabase Redirects

### Go to Supabase Console

1. Navigate to: https://app.supabase.com → Your Project
2. Go to **Authentication** → **URL Configuration**
3. Under **Redirect URLs**, add:
   ```
   vocme://auth/callback
   ```
4. Save changes

This tells Supabase where to send users after OAuth succeeds.

---

## Step 2: Configure iOS Deeplink

### In Xcode (after `npx cap open ios`)

1. Select **App** → **Targets** → **VocMe**
2. Go to **Info** tab
3. Under **URL Types**, add new URL scheme:
   - **Identifier:** `com.vocme.app`
   - **URL Schemes:** `vocme`
   - **Role:** Editor

This makes iOS recognize `vocme://` links and open your app.

---

## Step 3: Add OAuth Redirect URI to Google & Apple

### For Google OAuth

1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 credential
3. Under **Authorized redirect URIs**, add:
   ```
   https://yhazqyknzzbvxsqbcren.supabase.co/auth/v1/callback
   ```
4. Save

### For Apple Sign In

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Select your App ID
3. Under **Sign in with Apple**, configure:
   - **Primary App ID**: Your app
   - **Return URLs**:
     ```
     https://yhazqyknzzbvxsqbcren.supabase.co/auth/v1/callback
     ```
4. Save

---

## Step 4: Test on Device

```bash
# Build and sync
npm run build
npx cap sync ios

# Open Xcode
npx cap open ios

# Run on iPhone or simulator
# Cmd + R to build and run
```

### Test Flow

1. Tap "Continue with Google" or "Continue with Apple"
2. You should see **in-app browser** (not Safari)
3. Authenticate with your account
4. Browser closes automatically
5. You're logged in and redirected to feed
6. **Still in the app** ✅

---

## Troubleshooting

### Browser still opens in Safari

**Problem:** OAuth still opens Safari instead of in-app browser

**Solution:**
- Check iOS version (must be iOS 12+)
- Verify `presentationStyle: "popover"` in nativeAuthService.ts
- Ensure `skipBrowserRedirect: true` is NOT used with deeplinks

### Auth fails with "timeout"

**Problem:** Session never established after authentication

**Solution:**
- Verify Supabase deeplink is configured: `vocme://auth/callback`
- Check Supabase URL Configuration in console
- Ensure OAuth app is configured with correct redirect URI

### "Cannot find module" errors

**Problem:** TypeScript compilation errors

**Solution:**
- Run `npm install`
- Clear node_modules: `rm -rf node_modules && npm install`
- Rebuild: `npm run build`

### User stays on auth page

**Problem:** useAuthRedirect hook not working

**Solution:**
- Check AuthContext is properly configured
- Verify user object is being set after OAuth
- Add console.log in AuthPage to debug

---

## Code Changes Summary

### Files Modified

1. **src/services/nativeAuthService.ts** (NEW)
   - Handles OAuth with in-app browser
   - Checks for native platform
   - Falls back to standard OAuth on web

2. **src/pages/AuthPage.tsx**
   - Imports nativeAuthService
   - Replaces Browser.open() calls
   - Simplified OAuth flow

3. **src/hooks/useAuthRedirect.ts** (NEW)
   - Handles redirect to feed after auth
   - Waits for session to establish

### Key Improvements

✅ No Safari redirect
✅ Auth happens in-app
✅ Better UX
✅ Apple app store approval (in-app auth required)
✅ Works on iOS 12+
✅ Fallback to web on browser

---

## Testing Checklist

- [ ] User can sign in with Google
- [ ] User can sign in with Apple
- [ ] Browser stays in-app (not Safari)
- [ ] User redirected to feed after auth
- [ ] No "timeout" errors
- [ ] Refresh app - user still logged in
- [ ] Log out works
- [ ] Can access all features (Delete Account, etc)

---

## Next Steps

1. Configure deeplink in Xcode (Step 2)
2. Test on real iPhone
3. Verify Supabase console (Step 1)
4. Check Google/Apple OAuth credentials (Step 3)
5. Submit to Apple! 🚀
