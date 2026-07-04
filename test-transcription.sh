#!/bin/bash

# VocMe Transcription Feature - Integration Test Suite
# Run this after deploying the Edge Function

set -e

echo "🎤 VocMe Transcription Test Suite"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if build passes
echo -e "${YELLOW}Test 1: Build Check${NC}"
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Build passes${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Test 2: Check if TypeScript compiles
echo -e "${YELLOW}Test 2: TypeScript Compilation${NC}"
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript compiles${NC}"
else
    echo -e "${RED}❌ TypeScript errors found${NC}"
    exit 1
fi

# Test 3: Check if transcriptionService.ts exists
echo -e "${YELLOW}Test 3: Transcription Service${NC}"
if [ -f "src/services/transcriptionService.ts" ]; then
    echo -e "${GREEN}✅ transcriptionService.ts exists${NC}"
else
    echo -e "${RED}❌ transcriptionService.ts not found${NC}"
    exit 1
fi

# Test 4: Check if Edge Function exists
echo -e "${YELLOW}Test 4: Edge Function${NC}"
if [ -f "supabase/functions/transcribe-audio/index.ts" ]; then
    echo -e "${GREEN}✅ transcribe-audio Edge Function exists${NC}"
else
    echo -e "${RED}❌ Edge Function not found${NC}"
    exit 1
fi

# Test 5: Check RecordPage import
echo -e "${YELLOW}Test 5: RecordPage Import${NC}"
if grep -q "transcribeAudio" src/pages/RecordPage.tsx; then
    echo -e "${GREEN}✅ RecordPage imports transcribeAudio${NC}"
else
    echo -e "${RED}❌ RecordPage doesn't import transcribeAudio${NC}"
    exit 1
fi

# Test 6: Check RealsViewer transcription display
echo -e "${YELLOW}Test 6: RealsViewer Display${NC}"
if grep -q "post.transcription" src/components/RealsViewer.tsx; then
    echo -e "${GREEN}✅ RealsViewer displays transcription${NC}"
else
    echo -e "${RED}❌ RealsViewer doesn't display transcription${NC}"
    exit 1
fi

# Test 7: Check iOS sync
echo -e "${YELLOW}Test 7: iOS Sync${NC}"
if npx cap sync ios > /dev/null 2>&1; then
    echo -e "${GREEN}✅ iOS sync successful${NC}"
else
    echo -e "${RED}❌ iOS sync failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "Next steps:"
echo "1. Set OpenAI API key: supabase secrets set OPENAI_API_KEY=sk-..."
echo "2. Deploy Edge Function: supabase functions deploy transcribe-audio"
echo "3. Test on device: Record and publish a post"
echo "4. Check transcription appears within 5-15 seconds"
