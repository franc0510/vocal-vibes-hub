# 🚀 APPLE OAUTH QUICK SETUP (5 MIN)

## **PHASE 1: Apple Developer (5 min)**

### Box 1: Create App ID
```
1. developer.apple.com/account → Identifiers → +
2. App ID for "com.vocme.app"
3. ✅ Tick "Sign in with Apple"
4. Register
```
**Done**: You have App ID ✅

### Box 2: Create Service ID
```
1. developer.apple.com/account → Identifiers → +
2. Service ID → Identifier: "com.vocme.web"
3. Configure → Return URLs:
   https://YOUR_SUPABASE_URL.supabase.co/auth/v1/callback
4. Register
```
**Done**: You have Service ID ✅

### Box 3: Generate Private Key
```
1. developer.apple.com/account → Keys → +
2. App Store Connect API Key → Admin
3. Download .p8 file
4. Note: Key ID (top of page) + Team ID (account settings)
```
**Done**: You have Key ID, Team ID, .p8 file ✅

---

## **PHASE 2: Supabase (2 min)**

### Box 4: Configure Apple Provider
```
1. app.supabase.com → Your Project
2. Authentication → Providers → Apple
3. Fill in:
   - Service ID: com.vocme.web
   - Key ID: (from Box 3)
   - Team ID: (from Box 3)
   - Private Key: (paste .p8 content)
4. Enable
5. Save
```
**Done**: Supabase Apple provider configured ✅

### Box 5: Add Callback URLs
```
1. Supabase → Project Settings → API → Authorization
2. Callback URLs - Add:
   - capacitor://localhost (iOS native)
   - http://localhost:5173 (Vite dev)
3. Save
```
**Done**: Callback URLs set ✅

---

## **PHASE 3: Xcode (3 min)**

### Box 6: Add Capabilities
```
1. Xcode → ios/App/App.xcodeproj
2. Select "App" project
3. Signing & Capabilities tab
4. "+ Capability" → "Sign in with Apple"
5. Verify Bundle ID = com.vocme.app
```
**Done**: Capability added ✅

### Box 7: Add URL Schemes
```
1. Xcode → Info tab → URL Types
2. Add new URL Type:
   - Identifier: capacitor
   - URL Schemes: capacitor
   - Role: Editor
3. Xcode → Signing & Capabilities → "+ Capability" → "Associated Domains"
4. Add:
   - applinks:YOUR_SUPABASE_DOMAIN
   - webcredentials:YOUR_SUPABASE_DOMAIN
```
**Done**: URL schemes configured ✅

---

## **PHASE 4: Code (Already Done ✅)**

✅ `src/pages/AuthPage.tsx` - `handleAppleSignIn()` implemented
✅ Button "Continue with Apple" added
✅ Capacitor Browser integration ready

---

## **PHASE 5: Test**

```bash
# Build web
npm run build

# Sync iOS
npx cap sync ios

# Open Xcode
npx cap open ios

# Run on device/simulator (Cmd + R)
```

---

## **IF IT FAILS**

```
❌ "Invalid redirect URI"
→ Check Callback URLs in Supabase match your domain

❌ "Invalid client_id"
→ Check Service ID = exactly "com.vocme.web"

❌ "The operation couldn't be completed"
→ Regenerate .p8 key, paste new one in Supabase

❌ App crashes
→ Xcode Clean Build (Cmd+Shift+K) + Rebuild

❌ Nothing happens when clicking button
→ Check console logs (Xcode Debug Navigator)
→ Check `handleAppleSignIn()` is being called
```

---

## **SUMMARY CHECKLIST**

- [ ] App ID created (com.vocme.app)
- [ ] Service ID created (com.vocme.web)
- [ ] Private Key generated + saved
- [ ] Supabase Apple provider configured
- [ ] Callback URLs added to Supabase
- [ ] Xcode: Sign in with Apple capability ON
- [ ] Xcode: URL Schemes (capacitor) added
- [ ] Xcode: Associated Domains added
- [ ] Build + Sync + Test ✅

**You're ready! 🍎**
