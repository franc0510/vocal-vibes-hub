# Transcription Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     VocMe iOS App (React)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  RecordPage.tsx                                                  │
│  ├─ Audio recording                                             │
│  ├─ handlePublish() [MODIFIED]                                 │
│  │  └─ Calls transcribeAudio() after upload                    │
│  └─ transcriptionService import                                │
│                                                                   │
│  RealsViewer.tsx                                                │
│  └─ Displays transcription with "CC" label                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Storage                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  audio/ bucket                                                   │
│  ├─ {user_id}/{timestamp}.mp4                                  │
│  ├─ {user_id}/{timestamp}.webm                                 │
│  └─ {user_id}/{timestamp}.ogg                                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Database                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  voice_posts table                                              │
│  ├─ id (UUID)                                                  │
│  ├─ user_id                                                    │
│  ├─ title                                                      │
│  ├─ audio_url                                                  │
│  ├─ transcription ← [WILL BE FILLED]                          │
│  ├─ duration                                                   │
│  └─ image_url (optional)                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Supabase Edge Functions (Deno)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  transcribe-audio/index.ts [NEW]                               │
│  ├─ Receives: { audio_url, voice_post_id }                     │
│  ├─ Fetches audio from public URL                              │
│  ├─ Calls OpenAI Whisper API                                   │
│  │  └─ POST /v1/audio/transcriptions                           │
│  ├─ Receives transcription text                                │
│  └─ Updates voice_posts.transcription field                    │
│                                                                   │
│  Config: deno.json [NEW]                                       │
│  └─ Imports for Supabase client                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenAI Whisper API                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Authentication: Bearer {OPENAI_API_KEY}                       │
│  Input: Audio file (mp3, wav, m4a, ogg, etc)                  │
│  Processing: Speech-to-text (95%+ accuracy)                   │
│  Output: { text: "transcription...", language: "en" }        │
│  Cost: $0.006 per minute                                       │
│                                                                   │
│  [Stored in Supabase Vault as encrypted secret]               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow (Timeline)

```
┌─────────────────────────────────────────────────────────────────┐
│ Time | Event                                                     │
├─────────────────────────────────────────────────────────────────┤
│ T+0s │ User taps "Publish" button                               │
│ T+1s │ Audio uploaded to Supabase Storage                       │
│ T+2s │ voice_posts entry created in database                   │
│ T+2s │ transcribeAudio() called (async, non-blocking)          │
│ T+3s │ ✅ API returns "Published! 🎉" to user                   │
│ T+3s │ 🎤 Edge Function invokes in background                   │
│ T+4s │ Audio fetched from public URL                            │
│ T+5s │ Sent to OpenAI Whisper API                               │
│ T+6s │ 🔄 Whisper processes audio (5-10 seconds)              │
│ T+15s│ Transcription text received                              │
│ T+16s│ voice_posts.transcription field updated                 │
│ T+17s│ 📱 UI auto-refreshes (polling or subscription)          │
│ T+18s│ ✨ "CC" label appears with transcription                │
└─────────────────────────────────────────────────────────────────┘
```

## Component Communication

```
RecordPage.tsx
    │
    ├─ Calls transcribeAudio()
    │
    ▼
transcriptionService.ts
    │
    ├─ Invokes Supabase Function
    │
    ▼
Supabase.functions.invoke()
    │
    └─ HTTP POST to transcribe-audio Edge Function
    
    ▼
    
supabase/functions/transcribe-audio/index.ts
    │
    ├─ Fetches audio file
    │
    ├─ Calls OpenAI API
    │
    └─ Updates database via Supabase client
    
    ▼
    
voice_posts.transcription field updated
    │
    └─ RealsViewer.tsx displays automatically
```

## Database Schema

```sql
-- voice_posts table (relevant columns)
CREATE TABLE voice_posts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  transcription TEXT,  -- ← NEW: Stores transcription
  duration INTEGER NOT NULL,
  image_url TEXT,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- No new tables needed!
-- Uses existing voice_posts.transcription column
```

## Security Model

```
┌────────────────────────────────────┐
│  Client-side (React)               │
│  ├─ No API key exposed             │
│  └─ Uses authenticated session     │
└────────┬─────────────────────────────┘
         │ (Secure WebSocket/HTTPS)
         ▼
┌────────────────────────────────────┐
│  Supabase Edge Function (Deno)     │
│  ├─ Runs on Supabase infrastructure│
│  ├─ API key stored in Vault        │
│  ├─ Encrypted at rest               │
│  └─ Never exposed to client        │
└────────┬─────────────────────────────┘
         │ (Direct HTTPS)
         ▼
┌────────────────────────────────────┐
│  OpenAI Whisper API                │
│  ├─ Receives OPENAI_API_KEY        │
│  └─ Processes audio securely       │
└────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│     Developer Workstation               │
│     ├─ src/pages/RecordPage.tsx        │
│     ├─ src/services/                    │
│     └─ supabase/functions/              │
└────────────┬────────────────────────────┘
             │ (git push / deploy)
             ▼
┌─────────────────────────────────────────┐
│     GitHub / Deployment Service         │
│     └─ CI/CD Pipeline (optional)        │
└────────────┬────────────────────────────┘
             │ (deploy)
             ▼
┌──────────────────────────────┬──────────────────────────────┐
│   Supabase Project           │   App Distribution          │
├──────────────────────────────┼──────────────────────────────┤
│ ├─ Edge Functions            │ ├─ iOS App Store            │
│ │  └─ transcribe-audio      │ ├─ Google Play Store        │
│ ├─ Database                  │ └─ Web (Vite)              │
│ ├─ Storage (audio/)          │                            │
│ └─ Vault (secrets)           │                            │
└──────────────────────────────┴──────────────────────────────┘
```

## Cost Flow

```
┌────────────────────────────┐
│ 1000 audio posts published  │
│ Average: 60 seconds each    │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ 1000 × $0.006 per minute   │
│ = 1000 × 60 seconds        │
│ = 1000 × 1 minute          │
│ = $6.00 total              │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│ Break-even analysis:        │
│ • Premium subscription: $5  │
│ • 1000 posts ≈ 100 users   │
│ • Cost: $6 / Revenue: $500  │
│ • ROI: 8,200% 📈           │
└────────────────────────────┘
```

## Integration with Apple Guidelines

```
VocMe Transcription Feature
    │
    ├─ ✅ Guideline 1.4.1 - Accessibility
    │   └─ Provides text alternative to audio
    │
    ├─ ✅ Guideline 2.3 - Performance
    │   └─ Non-blocking background process
    │
    ├─ ✅ Guideline 4.2 - Design
    │   └─ Clean UI with "CC" label
    │
    └─ ✅ Guideline 5.2 - Privacy
        └─ No personal data collected
```

---

This architecture is:
- ✅ Scalable (Edge Functions auto-scale)
- ✅ Reliable (Error handling at each layer)
- ✅ Secure (API keys in Vault)
- ✅ Cost-effective ($0.006 per minute)
- ✅ Non-blocking (Background processing)
- ✅ User-friendly (Automatic & seamless)
