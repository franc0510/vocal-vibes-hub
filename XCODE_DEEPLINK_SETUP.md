# iOS Deeplink Configuration (Xcode)

## Quick Step: Add URL Scheme to iOS App

### After running `npx cap open ios`

1. **Open Xcode**
   ```bash
   npx cap open ios
   ```

2. **Select "App" in Xcode**
   - Left sidebar → App
   - Not "Pods" or other targets

3. **Go to "Info" tab**
   - Top menu: App → "App" (target)
   - Tab: "Info"

4. **Scroll down to "URL Types"**
   - If not visible, click "+" at bottom to add it
   - Expand "URL Types"

5. **Add New URL Type**
   - Click the "+" button next to URL Types
   - New row appears
   - Fill in:
     - **Identifier**: `com.vocme.app` (or leave empty)
     - **URL Schemes**: `vocme`
     - **Role**: Editor (default is fine)

6. **Save**
   - Cmd+S

### Result

Now iOS recognizes:
- `vocme://auth/callback` → Opens app
- `vocme://profile` → Could open to profile, etc.

---

## Verify Configuration

### Check Info.plist

1. Right-click App folder → Open as → Source Code
2. Search for `URL Types` or `CFBundleURLSchemes`
3. Should contain:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.vocme.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>vocme</string>
    </array>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
  </dict>
</array>
```

---

## Build & Run

```bash
# In Xcode
Cmd + R (Build and run)

# Or in terminal
npx cap build ios
```

---

## Test Deeplink

### From Xcode Console

Paste in Safari on simulator:
```
vocme://auth/callback
```

App should open!

---

## Important Notes

⚠️ This is **NOT** the same as:
- Universal Links (*.com routes)
- App Links (*.com with .well-known)

This is a **Custom URL Scheme** - simpler to set up, specific to your app.

✅ This works for:
- OAuth redirects from Supabase
- Deep linking from messages/shares
- Testing auth flow

---

## Still not working?

### Check these:

1. Is `Capacitor.isNativePlatform()` returning true?
   - Add console.log in AuthPage

2. Is Supabase OAuth configured with deeplink?
   - Check URL Configuration in Supabase console
   - Should have `vocme://auth/callback`

3. Did you rebuild after changing Xcode settings?
   - Clean: Cmd+Shift+K
   - Rebuild: Cmd+B

4. Is iOS 12+?
   - Open in Xcode → Deployment target
   - Should be 12.0 or higher

---

## Next

Once deeplink is working:
1. Test on real iPhone
2. Verify all OAuth flows work
3. Submit to Apple! 🚀
