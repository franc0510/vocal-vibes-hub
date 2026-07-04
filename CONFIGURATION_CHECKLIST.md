# ✅ Configuration Checklist - Apple OAuth

## **What Do You Need? (Answer to your question)**

You need **3 things** configured to make Apple OAuth work:

---

## **1️⃣ Supabase Credentials → `.env.local`**

### Where to get them:
1. Go to: https://app.supabase.com
2. Select your project
3. Click Settings → API (left sidebar)
4. Copy these two values:

| Value | From | Copy to `.env.local` |
|-------|------|-----|
| **Project URL** | Settings → API → Project URL | `VITE_SUPABASE_URL=https://yhazqyknzzbvxsqbcren.supabase.co/rest/v1/` |
| **anon public key** | Settings → API → anon (public) | `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_8NZYJWDVur114zkd9aSKiw_QLGINWBs` |

### How to fill it:
```bash
nano .env.local
```

Replace placeholders:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Time: 2 minutes**

---

## **2️⃣ Apple Developer Account Configuration**

### ✅ You need to create 3 things in Apple Developer:

#### **A) App ID**
- Go to: https://developer.apple.com/account
- Certificates, IDs & Profiles → Identifiers
- Create New Identifier → App IDs
- Description: "Vocal Vibes"
- Bundle ID: `com.vocme.app`
- Capabilities: Enable "Sign in with Apple"
- Save

#### **B) Service ID**
- Certificates, IDs & Profiles → Identifiers
- Create New Identifier → Services IDs
- Description: "Vocal Vibes Web Service"
- Identifier: `com.vocme.web`
- Enable "Sign in with Apple"
- Configure:
  - Primary App ID: Select your App ID from step A
  - Domains and subdomains:
    - `vocme.app`
    - `www.vocme.app`
  - Return URLs:
    - `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
    - `capacitor://localhost`
    - `http://localhost:5173`
- Save

#### **C) Private Key (.p8)**
- Certificates, IDs & Profiles → Keys
- Create New Key
- Name: "Apple Sign In"
- Enable "Sign in with Apple"
- Configure Primary App ID: Select your App ID from step A
- Download (only once!)
- Open downloaded file: `AuthKey_XXXXXXXXXX.p8`
- Copy the entire contents

**Time: 10-15 minutes**

---

## **3️⃣ Supabase Provider Configuration**

### What you collected from step 2:

| Value | Where | How to find |
|-------|-------|-----------|
| **Service ID** | From step B | Should be: `com.vocme.web` |
| **Key ID** | Apple Developer → Keys | Format: `XXXXXXXXXX` (from filename: `AuthKey_XXXXXXXXXX.p8`) |
| **Team ID** | Apple Developer → Account | Your Apple Team ID (10 chars, like `ABCD123456`) |
| **Private Key** | From step C | Content of `.p8` file (starts with `-----BEGIN PRIVATE KEY-----`) |

### How to enter in Supabase:

1. Go to: https://app.supabase.com
2. Select your project
3. Authentication → Providers
4. Search for "Apple" or scroll down
5. Click to expand
6. Fill in:
   - Service ID: `com.vocme.web`
   - Key ID: `XXXXXXXXXX`
   - Team ID: `ABCD123456`
   - Private Key: (paste entire `.p8` file contents)
7. ✅ Enable
8. Save

**Time: 5 minutes**

---

## **4️⃣ (Optional but Recommended) Xcode Capabilities**

### Add to iOS app:
```
ios/App/App.xcodeproj
```

1. Open with Xcode: `npx cap open ios`
2. Select "App" project (left sidebar)
3. Go to "Signing & Capabilities" tab
4. Click "+ Capability"
5. Search "Sign in"
6. Add "Sign in with Apple"
7. Leave with defaults
8. Save (Cmd+S)

**Time: 3 minutes**

---

## **5️⃣ Test Everything Works**

```bash
# Build
npm run build

# Sync iOS
npx cap sync ios

# Open iOS in Xcode
npx cap open ios

# Or run dev server on web
npm run dev
```

Then:
- Go to login page
- Should see "Continue with Apple" button
- Click it and test the flow

---

## **Order of Operations (Do in this order!)**

1. ✅ Fill `.env.local` with Supabase URL + key (2 min)
2. ✅ Create Apple Developer IDs + Service ID + Key (15 min)
3. ✅ Configure Apple Provider in Supabase (5 min)
4. ✅ Add Xcode capability (3 min)
5. ✅ Test (2 min)

**Total: ~30 minutes**

---

## **TL;DR - Exact Commands**

```bash
# 1. Edit .env.local with your Supabase credentials
nano .env.local

# 2. (Manual) Create Apple Developer IDs at https://developer.apple.com/account
#    Record: Service ID, Key ID, Team ID, Private Key content

# 3. (Manual) Configure Apple Provider in Supabase
#    Fill in the 4 values from step 2

# 4. Build and test
npm run build
npx cap sync ios
npx cap open ios
npm run dev
```

---

## **Quick Validation**

Run this in terminal to verify setup:
```bash
echo "✅ Checking configuration..."
test -f .env.local && echo "✅ .env.local exists" || echo "❌ .env.local missing"
grep "VITE_SUPABASE_URL" .env.local && echo "✅ VITE_SUPABASE_URL set" || echo "❌ VITE_SUPABASE_URL missing"
grep "VITE_SUPABASE_PUBLISHABLE_KEY" .env.local && echo "✅ VITE_SUPABASE_PUBLISHABLE_KEY set" || echo "❌ VITE_SUPABASE_PUBLISHABLE_KEY missing"
```

Expected output:
```
✅ Checking configuration...
✅ .env.local exists
✅ VITE_SUPABASE_URL set
✅ VITE_SUPABASE_PUBLISHABLE_KEY set
```

---

## **Questions by Step**

### Step 1 - "Where is my Supabase URL?"
Settings → API → Copy "Project URL"

### Step 2 - "Where is my Apple Team ID?"
https://developer.apple.com/account → Top right corner

### Step 2 - "Where is my Key ID?"
When you download the `.p8` file, the filename is `AuthKey_XXXXXXXXXX.p8`
The `XXXXXXXXXX` part is your Key ID.

### Step 3 - "Where do I paste the Private Key?"
Open the `.p8` file with a text editor, copy EVERYTHING (including the dashes at start/end)

### Still stuck?
Check: `APPLE_OAUTH_DIAGNOSTIC.md` for testing steps
