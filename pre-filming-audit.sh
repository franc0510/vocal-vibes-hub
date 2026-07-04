#!/bin/bash

# COMPREHENSIVE PRE-FILMING AUDIT
# Vérifie TOUT avant que tu fasses la vidéo

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          🎬 APPLE REVIEW VIDEO - PRE-FILMING AUDIT             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

ISSUES=0

# ============================================================================
# SECTION 1: EULA MODAL CHECKS
# ============================================================================

echo "📋 SECTION 1: EULA MODAL VERIFICATION"
echo "─────────────────────────────────────"

# Check 1: EULA title
if grep -q "Terms of Service & EULA" src/pages/AuthPage.tsx; then
    echo "  ✅ EULA title: 'Terms of Service & EULA'"
else
    echo "  ❌ EULA title MISSING"
    ((ISSUES++))
fi

# Check 2: "Zero tolerance" text
if grep -q "zero.tolerance\|zero-tolerance" src/pages/AuthPage.tsx; then
    echo "  ✅ 'Zero tolerance' text present"
else
    echo "  ❌ 'Zero tolerance' text MISSING (CRITICAL!)"
    ((ISSUES++))
fi

# Check 3: EULA modal is scrollable
if grep -q "max-h.*overflow-y-auto" src/pages/AuthPage.tsx; then
    echo "  ✅ EULA modal is scrollable (overflow-y-auto)"
else
    echo "  ❌ EULA modal NOT scrollable"
    ((ISSUES++))
fi

# Check 4: Checkbox exists
if grep -q "eulaAccepted\|eula.*checkbox" src/pages/AuthPage.tsx; then
    echo "  ✅ EULA acceptance checkbox found"
else
    echo "  ❌ EULA checkbox MISSING"
    ((ISSUES++))
fi

# Check 5: Button requires acceptance
if grep -q "disabled.*!eulaAccepted\|eulaAccepted.*disabled" src/pages/AuthPage.tsx; then
    echo "  ✅ Button disabled until EULA accepted"
else
    echo "  ❌ Button NOT disabled until accepted"
    ((ISSUES++))
fi

echo ""

# ============================================================================
# SECTION 2: REPORT MODAL CHECKS
# ============================================================================

echo "🚩 SECTION 2: REPORT FEATURE VERIFICATION"
echo "──────────────────────────────────────────"

# Check 1: FlagReportModal component exists
if [ -f src/components/FlagReportModal.tsx ]; then
    echo "  ✅ FlagReportModal component exists"
else
    echo "  ❌ FlagReportModal component MISSING"
    ((ISSUES++))
fi

# Check 2: All 6 report reasons exist
REASON_COUNT=$(grep -o "Harassment\|Hate speech\|Explicit\|Copyright\|Spam\|Other" src/components/FlagReportModal.tsx | wc -l)
if [ "$REASON_COUNT" -ge 6 ]; then
    echo "  ✅ All 6 report reasons found:"
    grep -o '"[^"]*"\s*,' src/components/FlagReportModal.tsx | grep -E "Harassment|Hate speech|Explicit|Copyright|Spam|Other" | head -6 | sed 's/^/     /'
else
    echo "  ❌ Report reasons INCOMPLETE (found: $REASON_COUNT, need: 6)"
    ((ISSUES++))
fi

# Check 3: Report modal header
if grep -q "Report Post\|report.*mode" src/components/FlagReportModal.tsx; then
    echo "  ✅ Report modal header found"
else
    echo "  ❌ Report modal header MISSING"
    ((ISSUES++))
fi

# Check 4: Submit button exists
if grep -q "Submit Report\|Report.*button" src/components/FlagReportModal.tsx; then
    echo "  ✅ Submit Report button found"
else
    echo "  ❌ Submit button MISSING"
    ((ISSUES++))
fi

# Check 5: Modal is scrollable
if grep -q "max-h.*overflow-y-auto" src/components/FlagReportModal.tsx; then
    echo "  ✅ Report modal has scrollable content"
else
    echo "  ❌ Report modal NOT scrollable"
    ((ISSUES++))
fi

echo ""

# ============================================================================
# SECTION 3: BLOCK USER CHECKS
# ============================================================================

echo "🚫 SECTION 3: BLOCK USER FEATURE VERIFICATION"
echo "──────────────────────────────────────────────"

# Check 1: Block button exists
if grep -q "Block.*authorName\|Block.*User" src/components/FlagReportModal.tsx; then
    echo "  ✅ Block User button found"
else
    echo "  ❌ Block button MISSING"
    ((ISSUES++))
fi

# Check 2: Confirmation dialog
if grep -q "Are you sure\|hide.*content\|Hide their content" src/components/FlagReportModal.tsx; then
    echo "  ✅ Block confirmation message found"
else
    echo "  ❌ Block confirmation MISSING"
    ((ISSUES++))
fi

# Check 3: Block removes posts instantly (client-side filter)
if grep -q "blockedUserIds.has\|Skip blocked" src/hooks/useVoicePosts.ts; then
    echo "  ✅ Block filter logic found (instant removal)"
else
    echo "  ❌ Block filter logic MISSING"
    ((ISSUES++))
fi

# Check 4: Toast notification for block
if grep -q "toast.*block\|Blocked.*content" src/components/FlagReportModal.tsx; then
    echo "  ✅ Block success notification found"
else
    echo "  ❌ Block notification MISSING"
    ((ISSUES++))
fi

echo ""

# ============================================================================
# SECTION 4: UI INTEGRATION CHECKS
# ============================================================================

echo "🎨 SECTION 4: UI INTEGRATION CHECKS"
echo "────────────────────────────────────"

# Check 1: More options button in VoiceCard
if grep -q "MoreVertical\|flagModalOpen" src/components/VoiceCard.tsx; then
    echo "  ✅ More options (...) button in VoiceCard"
else
    echo "  ❌ More options button MISSING"
    ((ISSUES++))
fi

# Check 2: Action bar layout looks good
if grep -q "flex.*gap.*Like.*Message.*Share" src/components/VoiceCard.tsx || grep -q "flex.*Heart.*MessageCircle.*Share2" src/components/VoiceCard.tsx; then
    echo "  ✅ Action bar has Like, Comment, Share buttons"
else
    echo "  ⚠️  Action bar layout - check manually"
fi

# Check 3: Modal is passed correct props
if grep -q "FlagReportModal" src/components/VoiceCard.tsx; then
    echo "  ✅ FlagReportModal integrated in VoiceCard"
else
    echo "  ❌ FlagReportModal NOT integrated"
    ((ISSUES++))
fi

echo ""

# ============================================================================
# SECTION 5: DATABASE CHECKS
# ============================================================================

echo "🗄️  SECTION 5: DATABASE SCHEMA CHECKS"
echo "─────────────────────────────────────"

# Check 1: Blocks migration exists
if ls supabase/migrations/*blocks* &>/dev/null; then
    echo "  ✅ Blocks table migration exists"
else
    echo "  ❌ Blocks migration MISSING"
    ((ISSUES++))
fi

# Check 2: Reports table referenced
if grep -q "reports" src/components/FlagReportModal.tsx; then
    echo "  ✅ Reports table is used"
else
    echo "  ⚠️  Reports table - check manually"
fi

echo ""

# ============================================================================
# SECTION 6: ENVIRONMENT CHECKS
# ============================================================================

echo "⚙️  SECTION 6: ENVIRONMENT CHECKS"
echo "─────────────────────────────────"

# Check 1: .env.local exists
if [ -f .env.local ]; then
    echo "  ✅ .env.local exists"
else
    echo "  ❌ .env.local MISSING"
    ((ISSUES++))
fi

# Check 2: Supabase URL in .env.local
if grep -q "VITE_SUPABASE_URL" .env.local; then
    echo "  ✅ VITE_SUPABASE_URL configured"
else
    echo "  ❌ VITE_SUPABASE_URL NOT configured"
    ((ISSUES++))
fi

# Check 3: Public key in .env.local
if grep -q "VITE_SUPABASE_PUBLISHABLE_KEY" .env.local; then
    echo "  ✅ VITE_SUPABASE_PUBLISHABLE_KEY configured"
else
    echo "  ❌ VITE_SUPABASE_PUBLISHABLE_KEY NOT configured"
    ((ISSUES++))
fi

echo ""

# ============================================================================
# FINAL REPORT
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════╗"

if [ $ISSUES -eq 0 ]; then
    echo "║                  ✅ ALL CHECKS PASSED!                        ║"
    echo "║                                                                ║"
    echo "║  Your app is ready for filming. Good to go! 🎬                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "🎥 NEXT STEPS:"
    echo "   1. npm run build"
    echo "   2. npx cap sync ios"
    echo "   3. npx cap open ios"
    echo "   4. Connect real iPhone"
    echo "   5. Follow APPLE_REVIEW_VIDEO_GUIDE.md"
    echo "   6. Film your 58-second video!"
    echo ""
    exit 0
else
    echo "║               ❌ $ISSUES ISSUE(S) FOUND - FIX BEFORE FILMING      ║"
    echo "║                                                                ║"
    echo "║  See issues above. Fix and re-run this script.                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi
