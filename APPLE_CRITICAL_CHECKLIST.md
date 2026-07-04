# 🔍 Critical Points Apple Will Check

## Video Inspection Checklist

Apple's review team will pause and check these specific points in your video:

---

## **Section 1: EULA Modal (0:00-0:20)**

**Apple checks:**
- [ ] Modal appears when user tries to create account (not randomly)
- [ ] Title says "Terms of Service & EULA" or similar (clear terminology)
- [ ] Content is readable (not too small, good contrast)
- [ ] **Contains "zero tolerance" text** (this is MANDATORY)
- [ ] Contains specific prohibited behaviors:
  - [ ] Harassment/bullying
  - [ ] Hate speech
  - [ ] Explicit content/exploitation
  - [ ] Spam/malicious
  - [ ] Copyright violation
- [ ] Has acceptance checkbox ("I agree...")
- [ ] Checkbox is UNCHECKED initially
- [ ] User checks the box
- [ ] Button changes to enabled (clickable)
- [ ] User clicks button
- [ ] Modal disappears and flow continues

**Why this matters:** Apple wants proof that ALL users see the UGC policy before joining.

---

## **Section 2: Report Mechanism (0:20-0:39)**

**Apple checks:**
- [ ] Report button/option is accessible from normal user flow (not hidden)
- [ ] "..." (more options) button is visible on content
- [ ] Report option appears in the menu (not buried)
- [ ] Modal shows report reasons - **EXACTLY 6 reasons**:
  1. [ ] "Harassment or bullying"
  2. [ ] "Hate speech"
  3. [ ] "Explicit content"
  4. [ ] "Copyright violation"
  5. [ ] "Spam or misleading"
  6. [ ] "Other"
- [ ] User can select reasons (radio button or similar)
- [ ] Submit button exists and works
- [ ] Success message shows ("Report submitted...")
- [ ] Flow returns to normal feed

**Why this matters:** Apple wants proof that users have easy way to flag bad content, and they want EXACTLY these 6 reasons (Apple is very specific).

---

## **Section 3: Block Mechanism (0:39-0:58)**

**Apple checks (CRITICAL):**
- [ ] Block option is accessible from same menu as Report
- [ ] Block confirmation dialog appears ("Are you sure?")
- [ ] User confirms the block action
- [ ] Success message shows ("Blocked [User]...")
- [ ] **MOST IMPORTANT: Blocked user's post DISAPPEARS from feed**
  - Apple will check that within 1-2 seconds, the card is gone
  - This proves instant removal, not just a "muted" post
  - Scroll feed to show the post is truly gone
- [ ] No error messages
- [ ] Feed displays other posts normally

**Why this matters:** Apple REQUIRES that blocking removes content instantly. This is the most critical check.

---

## **What Apple Reviewers Look For**

### ✅ PASS Indicators
- Clear modal with "zero tolerance" language
- 6 specific report reasons (not vague)
- Block removes content immediately
- All features work without errors
- Video is clear and stable
- Recorded on actual iPhone device

### ❌ FAIL Indicators
- EULA doesn't mention "zero tolerance"
- Report reasons are vague or missing
- Block doesn't remove content visibly
- Features throw errors
- Video is on simulator (wrong device)
- Video is over 60 seconds
- Audio is not muted

---

## **Technical Requirements**

### Device
- ✅ iPhone (any model)
- ❌ iPad (won't be accepted)
- ❌ Simulator (Apple checks device info)

### Video Quality
- ✅ 1080p minimum (native iPhone resolution)
- ✅ Steady/tripod recommended
- ✅ Good lighting (not dark)
- ✅ All text readable

### Audio
- ✅ COMPLETELY MUTED
- ❌ ANY sound (notifications, typing, etc.)

### Duration
- ✅ Under 60 seconds (Apple requirement)
- ⏳ 30-58 seconds ideal

### Format
- ✅ MP4 (.mp4)
- ✅ MOV (.mov)
- ❌ AVI, FLV, etc.

---

## **If Apple Rejects - Common Reasons & Fixes**

| Rejection Reason | What Apple Saw | Your Fix |
|------------------|----------------|----------|
| "EULA not visible" | Modal too small, scrolled too fast | Re-film, focus on modal longer, scroll slower |
| "Zero tolerance not mentioned" | They couldn't find that text | Check your EULA text includes "zero tolerance for abusive content" |
| "Report reasons incomplete" | Saw < 6 reasons or vague text | Ensure all 6 are clear: Harassment, Hate speech, Explicit, Copyright, Spam, Other |
| "Block doesn't work" | Post didn't disappear | Check that `useVoicePosts.ts` filters blocked users client-side |
| "Video shows simulator" | Device info shows "iPhone Simulator" | Re-film on actual physical iPhone connected to Xcode |
| "Video > 60 seconds" | Timestamp exceeded 60 | Re-film and keep under 58 seconds |
| "Can't understand features" | Video is blurry or too fast | Re-film: steady camera, move slowly, let animations complete |

---

## **Pre-Filming Verification**

Run this before recording:

```bash
# 1. Check EULA text
grep -i "zero.tolerance" src/pages/AuthPage.tsx
# Should output: ...zero tolerance for abusive content...

# 2. Check report reasons (should show all 6)
grep -A 10 "reasons = \[" src/components/FlagReportModal.tsx

# 3. Check block implementation
grep -n "handleBlock\|setMode.*block" src/components/FlagReportModal.tsx

# 4. Verify blocks are filtered
grep -n "blockedUserIds" src/hooks/useVoicePosts.ts
```

All should return results with no errors.

---

## **During Recording - Timing Guide**

```
0:00  - Open app, click "Create account"
0:03  - EULA modal appears
0:08  - Scroll through terms
0:13  - Check acceptance checkbox
0:16  - Click "I Agree & Continue"
0:19  - Modal closes (end of section 1)

0:20  - Feed loads with content
0:23  - Find a vocal card, click "..." button
0:26  - See report/block options
0:28  - Click "Report This Post"
0:30  - See 6 report reasons on screen (hold for 3 seconds)
0:35  - Select a reason
0:37  - Click "Submit"
0:39  - Success toast appears (end of section 2)

0:40  - Go back to feed
0:42  - Find another card, click "..."
0:44  - Click "Block [User]"
0:46  - Confirmation dialog appears
0:48  - Click "Yes, block"
0:50  - Success toast appears
0:52  - Scroll or wait for blocked post to disappear
0:55  - Blocked post is GONE from feed
0:58  - VIDEO ENDS
```

**Total: 58 seconds**

---

## **After Upload - What Happens**

1. You upload video to App Store Connect
2. Apple receives it in 5-10 minutes
3. App Review team (human) watches your video
4. They check against this guideline 1.2 requirements
5. They test your app with similar features
6. Decision: **APPROVE** or **REQUEST CHANGES**
7. If approved: you're ready for final submission
8. If rejected: they tell you specifically what to fix

---

## **Most Common Mistake**

❌ **Block doesn't remove content visibly**

Apple will FAIL your submission if the blocked user's post is still visible after blocking. Make sure:

```typescript
// In useVoicePosts.ts, this logic runs:
if (blockedUserIds.has(p.user_id)) continue; // Skip blocked users
```

This must be client-side (instant) not server-side (delayed).

---

## **Green Light = Success**

If your video shows:
- ✅ EULA with "zero tolerance" 
- ✅ Report with 6 exact reasons
- ✅ Block with instant removal
- ✅ No errors
- ✅ On real device
- ✅ Under 60 seconds

**Apple will approve within 24-48 hours.** Then you can submit to the App Store and launch! 🚀

---

**Final checklist before filming:**
- [ ] Device fully charged
- [ ] Good lighting in your room
- [ ] Tripod or stable surface
- [ ] App freshly built (`npm run build && npx cap sync ios`)
- [ ] App running on connected iPhone
- [ ] Audio muted
- [ ] Screenshot 1: EULA modal
- [ ] Screenshot 2: Report reasons
- [ ] Screenshot 3: Block confirmation
- [ ] You understand the timing

**You're ready! Film it!** 🎬
