# Supabase Secrets Configuration for Transcription

## Required Secrets for Production

Set these secrets in your Supabase project to enable automatic transcription:

### OPENAI_API_KEY
- **Required for**: Automatic audio transcription via Whisper API, and the storyboard step of story illustration
- **Value**: Your OpenAI API key starting with `sk-`
- **How to get**: https://platform.openai.com/api-keys
- **Pricing**: $0.006 per minute of audio; storyboards add ~$0.002–0.01 per illustrated anecdote

## Story illustration secrets

These only matter for the `illustrate-story` function. Without them, posts
publish and transcribe exactly as before and the "Illustrer" button reports a
clean failure.

### IMAGE_PROVIDER
- **Values**: `fal` (default), `gemini` or `openai`
- Picks which implementation in `_shared/imageProviders.ts` is used.
- Only `fal` can serve a custom-trained LoRA — required if you ever train your
  illustrator's style.

### IMAGE_MODEL
- The model id for the chosen provider, e.g. `fal-ai/flux-2/pro`,
  `gemini-2.5-flash-image`, `gpt-image-1`.
- Defaults per provider live in `_shared/imageProviders.ts`.
- **Decide this with `npm run bench:illustration`**, not from a pricing page.

### FAL_KEY
- **Required when** `IMAGE_PROVIDER=fal`
- **How to get**: https://fal.ai/dashboard/keys

### GEMINI_API_KEY
- **Required when** `IMAGE_PROVIDER=gemini`
- **How to get**: https://aistudio.google.com/apikey

### STORYBOARD_MODEL
- Optional. Defaults to `gpt-4.1-mini`. Uses `OPENAI_API_KEY`.

### ILLUSTRATION_DAILY_PANEL_QUOTA
- Optional, defaults to `24` panels per user per rolling 24 hours
  (roughly three full-length anecdotes). Panels are the unit that costs money.

### Illustration cost per anecdote

| Poste | Coût |
|-------|------|
| Storyboard (1 LLM call) | ~$0.002–0.01 |
| 6 panels | $0.02–0.80 depending on model |
| **Realistic total** | **~$0.10–0.15 per illustrated anecdote** |

### How to Set

#### Via Supabase CLI (Recommended)
```bash
supabase secrets set OPENAI_API_KEY=sk-your-key-here
```

#### Via Supabase Dashboard
1. Go to Project Settings → Vault → New Secret
2. Name: `OPENAI_API_KEY`
3. Value: Your OpenAI API key
4. Click "Create Secret"

#### Via Terraform (if using IaC)
```hcl
resource "supabase_secret" "openai_key" {
  project_id = var.supabase_project_id
  name       = "OPENAI_API_KEY"
  value      = var.openai_api_key
}
```

## Verification

After setting secrets, verify they're accessible to Edge Functions:

```bash
# List all secrets (shows names only, not values)
supabase secrets list

# You should see:
# name                    | encrypted
# OPENAI_API_KEY         | yes
```

## Security Best Practices

1. ✅ Never commit API keys to version control
2. ✅ Use environment-specific keys (dev/prod separate)
3. ✅ Rotate keys regularly
4. ✅ Monitor usage for unexpected spikes
5. ✅ Use Supabase Vault - keys are encrypted at rest

## Monitoring API Usage

https://platform.openai.com/account/usage

Track:
- Total tokens used
- Cost per request
- Requests per minute
- Error rates

## Costs Estimation

| Scenario | Duration | Cost |
|----------|----------|------|
| 1 voice post | 60s | $0.006 |
| 100 posts/day | ~100 min | ~$0.60 |
| 1000 posts | ~1000 min | ~$6.00 |
| 10,000 posts | ~10,000 min | ~$60.00 |

## Fallback Behavior

If `OPENAI_API_KEY` is not set:
- Posts still publish normally
- Automatic transcription silently fails
- User can still manually add transcription during recording
- No error shown to end user

## Support

If transcription isn't working:
1. Check Edge Function logs: Supabase Dashboard → Edge Functions → transcribe-audio → Logs
2. Verify secret is set: `supabase secrets list`
3. Test OpenAI API directly: `curl -H "Authorization: Bearer sk-..." https://api.openai.com/v1/audio/transcriptions`
