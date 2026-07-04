# Screen Recording Guide - Account Deletion Demo

## What Apple Needs to See

Apple requires a screen recording showing the **complete account deletion flow** from initiation to confirmation.

**Duration:** ~30 seconds
**Device:** Physical iPhone (not simulator)
**Format:** MP4 or MOV
**Audio:** MUTE (silent)

---

## Recording Steps

### Part 1: Access Settings (5 seconds)

1. Open the app
2. Tap **Profile tab** (bottom navigation)
3. Tap **Settings icon** (gear icon, top right)
4. App shows Settings page

### Part 2: Navigate to Delete Button (5 seconds)

1. Scroll down to bottom of Settings page
2. Show **"Log Out" button** (gray)
3. Show **"Delete My Account" button** (red, with trash icon)

### Part 3: Show Confirmation Modal (10 seconds)

1. Tap **"Delete My Account"** (red button)
2. Modal appears with:
   - ⚠️ Warning icon
   - Title: "Delete Account?"
   - Text: "This action is permanent"
   - Bullet list of what's deleted:
     - "Delete your profile and avatar"
     - "Delete all your voice posts and content"
     - "Delete your messages and comments"
     - "Cannot be undone"

### Part 4: Complete Deletion (5 seconds)

1. Tap **"Yes, Delete Everything"** button (red)
2. Show **success toast** notification: "Account deleted permanently"
3. Show **login screen** (user auto-logged out)

**Total Duration:** ~25-30 seconds

---

## How to Record on iPhone

### Method 1: Control Center (iOS 11+)

1. Go to **Settings → Control Center → Customize Controls**
2. Add **"Screen Recording"** if not present
3. Swipe from **top-right corner** to open Control Center
4. Long-press the **record icon** (circle)
5. Select **"Microphone Audio: Off"**
6. Tap **"Start Recording"** (red button)
7. Wait 3 seconds
8. Perform the demo
9. Swipe Control Center, tap the red timer to stop
10. Video saved in Photos app

### Method 2: Mac with QuickTime

1. Connect iPhone to Mac
2. Open **QuickTime Player**
3. **File → New Movie Recording**
4. Click dropdown, select your **iPhone**
5. Click **Record**
6. Perform the demo
7. Click **Stop**
8. **File → Export As** → Choose **MP4**

---

## Checklist

Before uploading, verify:

- ✅ Recording on physical iPhone (not simulator)
- ✅ Duration: 25-30 seconds
- ✅ Audio: Completely MUTE (no sound)
- ✅ Settings page clearly visible
- ✅ Red "Delete My Account" button shown
- ✅ Confirmation modal fully visible
- ✅ All bullet points readable
- ✅ "Yes, Delete Everything" button tapped
- ✅ Success toast notification visible
- ✅ Login screen shown at end
- ✅ Format: MP4 or MOV
- ✅ Video quality: Clear and readable

---

## Upload to App Store Connect

1. **Go to:** https://appstoreconnect.apple.com
2. **Select app:** VocMe
3. **Tab:** TestFlight → Build Information
4. **Section:** App Review Information
5. **Paste text:** (Use APPLE_DELETION_RESPONSE_TEXT.txt)
6. **Upload video file** in the file upload section
7. **Click Save**

---

## Alternative: If Account Deletion Fails

If the app deletion doesn't work perfectly, you can link to a web form:

Add this to your response to Apple:
"Users can also visit https://vocme.app/delete-account to complete account deletion via our website form."

Then create a simple web page at `/delete-account` that:
1. Asks for email
2. Verifies user identity (email confirmation)
3. Shows confirmation
4. Deletes account via server function

**But the in-app deletion is preferred and already implemented!**

---

## Notes

- Apple will review the video to confirm account deletion works
- They test on various iOS versions and devices
- Make sure deletion works from fresh install (not just test account)
- Video will be reviewed by Apple within 24-48 hours
- Do NOT record audio (will cause upload to fail)
- Do NOT show any errors or glitches

**Ready to record!** 🎬
