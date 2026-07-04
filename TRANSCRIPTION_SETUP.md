## Automatic Transcription Implementation

VocMe now features automatic audio transcription using OpenAI's Whisper API via Supabase Edge Functions.

### Architecture

```
User Records Audio
        ↓
User Publishes Post
        ↓
Audio uploaded to Supabase Storage
        ↓
voice_posts entry created in DB
        ↓
transcribeAudio() called in background
        ↓
Edge Function invokes Whisper API
        ↓
Transcription text stored in voice_posts.transcription
        ↓
UI automatically displays transcription with "CC" label
```

### Setup Instructions

#### 1. Environment Variables

Add to your Supabase project:

```bash
OPENAI_API_KEY=your_openai_key_here
```

To set this in Supabase:
1. Go to Supabase Dashboard → Settings → Vault
2. Add new secret: `OPENAI_API_KEY` with your OpenAI API key
3. Or use CLI: `supabase secrets set OPENAI_API_KEY=your_key`

#### 2. Deploy Edge Function

```bash
supabase functions deploy transcribe-audio
```

#### 3. Enable Function Access

Ensure your Supabase project allows the Edge Function to:
- Read from `audio` bucket in Storage
- Update `voice_posts` table

### How It Works

1. **Manual Transcription**: User can still manually type transcription during recording
2. **Automatic Transcription**: If no manual transcription provided:
   - After successful upload, `transcribeAudio()` is called
   - Function runs in background (doesn't block publishing)
   - Edge Function fetches audio from URL
   - Whisper API processes the audio
   - Result stored back in database
   - UI automatically displays when transcription is ready

### Files Modified

- `src/pages/RecordPage.tsx`: Added automatic transcription call after publish
- `src/services/transcriptionService.ts`: New service for Edge Function invocation
- `supabase/functions/transcribe-audio/index.ts`: Edge Function implementation

### Cost Considerations

- OpenAI Whisper API: $0.006 per minute of audio
- For 1000 posts with average 60 second duration: ~$6

### Supported Languages

Default: English (`language: "en"`)

To support multiple languages, modify the Edge Function to detect language:

```typescript
// In Edge Function
const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
  // Remove the language parameter to auto-detect
  // or implement language detection based on post metadata
});
```

### Testing

1. Record a new voice post
2. Publish without manual transcription
3. Check browser console for logs: "🎤 Starting automatic transcription..."
4. Wait ~5-15 seconds
5. Refresh the feed
6. See transcription appear with "CC" label

### Error Handling

- If transcription fails: Error logged to console, user is not notified (background process)
- If audio URL is invalid: Edge Function catches and logs error
- If OpenAI API is down: Graceful failure, post still published

### Future Enhancements

- [ ] Language auto-detection based on user profile
- [ ] Support for multiple languages with user preference
- [ ] Premium feature to disable transcription
- [ ] Transcription editing capability
- [ ] Real-time transcription during recording (Web Speech API fallback)
