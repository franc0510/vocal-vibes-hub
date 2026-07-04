#!/bin/bash
# Script pour récupérer les infos Supabase et vérifier la config Apple OAuth

echo "🍎 VocMe Apple OAuth Configuration Check"
echo "========================================"
echo ""

# Vérifier les fichiers existants
echo "✓ Checking local files..."
if [ -f ".env.local" ]; then
    echo "  ✅ .env.local exists"
    echo ""
    echo "  📝 Current values:"
    grep "VITE_SUPABASE" .env.local | sed 's/=/: /'
else
    echo "  ❌ .env.local NOT FOUND"
    echo "  📝 Create it from .env.local.example:"
    echo "     cp .env.local.example .env.local"
    echo "     Then edit with your Supabase credentials"
fi

echo ""
echo "========================================"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1️⃣  Go to: https://app.supabase.com"
echo "   - Select your 'VocMe' project"
echo "   - Settings → API"
echo "   - Copy:"
echo "     • Project URL → VITE_SUPABASE_URL"
echo "     • anon (public) → VITE_SUPABASE_PUBLISHABLE_KEY"
echo ""

echo "2️⃣  Paste into .env.local"
echo ""

echo "3️⃣  Go to: developer.apple.com/account"
echo "   - Create App ID (com.vocme.app) with Sign in with Apple"
echo "   - Create Service ID (com.vocme.web)"
echo "   - Generate Private Key (.p8)"
echo "   - Note: Key ID + Team ID"
echo ""

echo "4️⃣  Back to Supabase:"
echo "   - Authentication → Providers → Apple"
echo "   - Fill in Service ID, Key ID, Team ID, Private Key"
echo "   - Enable + Save"
echo ""

echo "5️⃣  In Xcode (ios/App/App.xcodeproj):"
echo "   - Signing & Capabilities → + Capability → Sign in with Apple"
echo "   - Info → URL Types → Add 'capacitor'"
echo ""

echo "6️⃣  Run:"
echo "   npm run build"
echo "   npx cap sync ios"
echo "   npx cap open ios"
echo "   # Then Cmd+R to run on device/simulator"
echo ""

echo "========================================"
echo "🍎 When ready, run: npm run dev"
echo "   Then click 'Continue with Apple'"
echo ""
