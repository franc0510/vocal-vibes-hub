# ✅ Apple Review Submission Checklist - Guideline 1.2

## **Before You Film**

- [ ] iPhone is connected and recognized by Xcode
- [ ] Fresh app build: `npm run build && npx cap sync ios`
- [ ] App runs without errors on physical device
- [ ] You have 1-2 spare minutes to re-record if needed

## **Recording Requirements**

- [ ] Physical iPhone device (NOT simulator)
- [ ] Screen recording with AUDIO MUTED
- [ ] Duration: < 60 seconds (target: 58 sec)
- [ ] Clear, stable video (tripod recommended)
- [ ] Good lighting (not dark)
- [ ] No watermarks or system UI cluttering

## **Demo Sequence Checklist**

### **Part 1: EULA Modal (0:00-0:20)**
- [ ] Click "Create account" on login screen
- [ ] EULA modal slides up from bottom
- [ ] Text visible: "Terms of Service & EULA"
- [ ] Text visible: "zero tolerance for abusive content"
- [ ] Checkbox visible: "I agree to..."
- [ ] Scroll through terms (show content)
- [ ] Check the checkbox
- [ ] Click "I Agree & Continue"
- [ ] Modal disappears

### **Part 2: Report Feature (0:20-0:39)**
- [ ] Feed loads with vocal cards
- [ ] Click "..." (MoreVertical) button on a card
- [ ] Modal pops up: "Manage Content" or "Report/Block"
- [ ] "Report This Post" button visible
- [ ] Click "Report This Post"
- [ ] List of 6 report reasons shows:
  - [ ] "Harassment or bullying"
  - [ ] "Hate speech"
  - [ ] "Explicit content"
  - [ ] "Copyright violation"
  - [ ] "Spam or misleading"
  - [ ] "Other"
- [ ] Select ONE reason (recommend "Hate speech")
- [ ] Click "Submit" or "Report" button
- [ ] Toast notification appears: "Report submitted"
- [ ] Modal closes

### **Part 3: Block Feature (0:39-0:58)**
- [ ] Go back to feed
- [ ] Click "..." on ANOTHER vocal card
- [ ] Modal opens again
- [ ] Click "Block [User Name]" button
- [ ] Confirmation dialog appears: "Are you sure?"
- [ ] Click "Yes, block them" or confirm
- [ ] Toast notification: "Blocked [User Name]"
- [ ] **IMPORTANT: Blocked user's card DISAPPEARS from feed**
- [ ] Video ends

## **File Preparation**

- [ ] Video exported as **MP4** or **MOV**
- [ ] Resolution: 1170x2532 (or native iPhone resolution)
- [ ] Frame rate: 30fps minimum
- [ ] Audio: **COMPLETELY MUTED** (silence)
- [ ] File size: < 500MB
- [ ] No subtitles or text overlays

## **App Store Connect Upload**

1. [ ] Go to: https://appstoreconnect.apple.com
2. [ ] Select app: **VocMe**
3. [ ] Navigate to: **TestFlight → Build Information**
4. [ ] Find: **App Review Information**
5. [ ] Locate: **Notes** field
6. [ ] Copy and paste the template below into **Notes**:

```
This video demonstrates the implementation of Guideline 1.2 precautions for user-generated content:

1. EULA/Terms of Service (0:00-0:20)
   - Shows the "Terms of Service & EULA" modal presented to all users before account creation
   - Displays zero-tolerance policy text for abusive content
   - Shows acceptance checkbox requirement
   - Confirms users must accept before proceeding

2. Flag/Report Mechanism (0:20-0:39)
   - Shows how users access the report feature (via ... menu button)
   - Displays all 6 predefined report reasons:
     * Harassment or bullying
     * Hate speech
     * Explicit content
     * Copyright violation
     * Spam or misleading
     * Other
   - Shows successful report submission notification
   - Developer is notified and content flagged for 24-hour review

3. Block User Mechanism (0:39-0:58)
   - Shows how users block abusive users (via ... menu button)
   - Shows blocking confirmation dialog
   - Demonstrates that blocked user's content is INSTANTLY removed from feed
   - Shows success notification to user

All features are fully functional and connected to our database for developer moderation.
```

7. [ ] **ATTACH THE VIDEO FILE** in the upload field below Notes
8. [ ] Click **Save**

## **Final QA Before Submit**

- [ ] EULA text is clearly readable in video
- [ ] All 6 report reasons are visible for at least 2 seconds
- [ ] Block confirmation is shown
- [ ] Blocked user card disappears (CRITICAL)
- [ ] All success toasts are visible
- [ ] No error messages shown
- [ ] Video is smooth (no lag)
- [ ] Timestamp matches written description

## **After Upload**

- [ ] Wait 24-48 hours for Apple review
- [ ] If rejected, check for common issues:
  - [ ] EULA not visible enough
  - [ ] Report reasons list incomplete
  - [ ] Block doesn't remove content instantly
  - [ ] Video too long (> 60 sec)
  - [ ] Audio not muted

## **Common Apple Responses**

| Issue | Solution |
|-------|----------|
| "EULA not clear" | Re-record with longer focus on modal, scroll more |
| "Report feature not obvious" | Show the "..." button more clearly, click it earlier |
| "Block doesn't work" | Ensure blocked card disappears immediately (client-side filter) |
| "Video too short" | Doesn't matter, under 60 sec is fine |
| "Can't hear/see properly" | Good! Audio muted is required. Video must be clear. |

## **Success Criteria**

Apple will likely **ACCEPT** if:

✅ EULA modal shows "zero tolerance"
✅ Report feature has 6 reasons (not 3, not custom)
✅ Block feature removes content instantly
✅ All notifications show success
✅ Video is under 60 seconds
✅ No error messages
✅ Clear demonstration on REAL device

---

## **Next Steps After Approval**

1. Apple notifies you (email + App Store Connect)
2. You can proceed with final build submission
3. Your app goes live to App Store! 🎉

---

**Questions? Check:**
- `APPLE_REVIEW_VIDEO_GUIDE.md` - Detailed filming guide
- `test-apple-features.sh` - Verify all features exist
- Your app code - Everything is already implemented!

Good luck! 🍎📹
