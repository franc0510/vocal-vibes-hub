## Quick Deploy Guide for Transcription Edge Function

### Prerequisites
- Supabase CLI installed: `brew install supabase-cli`
- OpenAI API Key: https://platform.openai.com/api-keys
- Logged into Supabase CLI: `supabase login`

### Step 1: Set OpenAI API Key in Supabase

```bash
# Navigate to project directory
cd /Users/mac-FGILLO05/vocal-vibes-hub-1

# Set the secret
supabase secrets set OPENAI_API_KEY=sk-your-key-here

# Verify it was set (shows masked version)
supabase secrets list
```

### Step 2: Deploy the Edge Function

```bash
# Deploy the transcribe-audio function
supabase functions deploy transcribe-audio

# You should see:
# ✓ Function 'transcribe-audio' successfully created with ID: ...
```

### Step 3: Verify Deployment

```bash
# List deployed functions
supabase functions list

# You should see: transcribe-audio | active | ...
```

### Step 4: Test the Function

```bash
# Invoke the function (replace IDs with real ones)
supabase functions invoke transcribe-audio \
  --body '{"audio_url":"https://storage.url/audio.mp3","voice_post_id":"123"}'

# Expected response:
# {
#   "success": true,
#   "transcription": "Hello, this is a test audio message",
#   "voice_post_id": "123"
# }
```

### Step 5: Monitor Function

In Supabase Dashboard:
1. Go to Edge Functions
2. Select `transcribe-audio`
3. View logs and invocation history
4. Check for errors

### Troubleshooting

**Function deploy fails:**
```bash
# Check if you're logged in
supabase projects list

# If not, login
supabase login
```

**"OPENAI_API_KEY not found" error:**
```bash
# Verify the secret is set
supabase secrets list

# Set it again if needed
supabase secrets set OPENAI_API_KEY=sk-...
```

**Transcription fails on production:**
1. Check Supabase Dashboard → Edge Functions → Logs
2. Verify OpenAI API key is valid and has quota
3. Ensure audio URL is publicly accessible
4. Check audio file format (should be mp3, wav, m4a, ogg, etc.)

### Local Testing

To test locally before deploying:

```bash
# Start local Supabase stack
supabase start

# Deploy to local environment
supabase functions deploy transcribe-audio --local

# Invoke locally
supabase functions invoke transcribe-audio --local \
  --body '{"audio_url":"https://example.com/audio.mp3","voice_post_id":"test-123"}'
```

### Production Deployment

The function is automatically available in production after deployment. All users will start seeing automatic transcriptions on their published posts!

### Monitoring Costs

Check OpenAI usage:
- Visit https://platform.openai.com/usage
- Filter by date range
- See per-minute breakdown

Estimate:
- 1 hour of audio = $0.36
- 1000 posts at 60 seconds avg = $6 per 1000 posts
