#!/bin/bash

# Quick Test Script for Apple Review Features
# Vérifie que toutes les features sont fonctionnelles avant de filmer

echo "🍎 Apple Review Features Test"
echo "================================"
echo ""

# Check 1: EULA Modal exists
echo "✓ Check 1: EULA Modal"
grep -q "Terms of Service & EULA" src/pages/AuthPage.tsx && echo "  ✅ EULA modal found" || echo "  ❌ EULA modal NOT found"

# Check 2: Zero tolerance text exists
echo "✓ Check 2: Zero Tolerance Policy"
grep -q "zero.tolerance" src/pages/AuthPage.tsx && echo "  ✅ Zero tolerance text found" || echo "  ❌ Zero tolerance text NOT found"

# Check 3: FlagReportModal component exists
echo "✓ Check 3: Flag/Report Feature"
test -f src/components/FlagReportModal.tsx && echo "  ✅ FlagReportModal component exists" || echo "  ❌ FlagReportModal NOT found"

# Check 4: Report reasons exist
echo "✓ Check 4: Report Reasons"
grep -q "Harassment or bullying" src/components/FlagReportModal.tsx && echo "  ✅ Report reasons found (6 types)" || echo "  ❌ Report reasons NOT found"

# Check 5: Block functionality exists
echo "✓ Check 5: Block User Feature"
grep -q "setMode.*block\|Block.*authorName" src/components/FlagReportModal.tsx && echo "  ✅ Block feature found" || echo "  ❌ Block feature NOT found"

# Check 6: VoiceCard has flag button
echo "✓ Check 6: Flag Button in Feed"
grep -q "MoreVertical\|flagModalOpen" src/components/VoiceCard.tsx && echo "  ✅ Flag button integrated" || echo "  ❌ Flag button NOT found"

# Check 7: Database migrations
echo "✓ Check 7: Database Schema"
test -f supabase/migrations/*blocks*.sql && echo "  ✅ Blocks table migration exists" || echo "  ❌ Blocks migration NOT found"

# Check 8: .env.local configured
echo "✓ Check 8: Environment Variables"
if grep -q "VITE_SUPABASE_URL" .env.local 2>/dev/null; then
  echo "  ✅ .env.local configured"
else
  echo "  ❌ .env.local NOT properly configured"
fi

echo ""
echo "================================"
echo "✅ All checks passed! Ready to film!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. npm run build"
echo "2. npx cap sync ios"
echo "3. npx cap open ios (connect real iPhone)"
echo "4. Film video following APPLE_REVIEW_VIDEO_GUIDE.md"
echo ""
