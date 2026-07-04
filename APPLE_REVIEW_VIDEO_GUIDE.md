# 📹 Apple Review Video Guide - Guideline 1.2

## **Vue d'ensemble : Ce que tu dois démontrer**

Apple demande une vidéo de **moins de 1 minute** qui montre :

1. ✅ **EULA/Terms of Service** présentés avant enregistrement/connexion
2. ✅ **Mechanism to flag/report** contenu objectif
3. ✅ **Mechanism to block** utilisateurs abusifs

---

## **Setup avant filming**

### **1. Sur un iPhone physique (PAS l'émulateur)**

```bash
# Build final
npm run build

# Sync iOS
npx cap sync ios

# Ouvrir Xcode
npx cap open ios
```

### **2. Dans Xcode**

- Sélectionne un **vrai iPhone** connecté
- Clique **▶️ Play** (Cmd+R)
- Attends que l'app se lance

### **3. Contrôle du volume**

- Mets le téléphone en mode silencieux (switch latéral en bas)
- Les vidéos de démo doivent être muettes de toute façon

---

## **Script de la vidéo (58 secondes)**

### **Partie 1 : EULA/Terms (20 sec)**

1. Appuyez sur **"Create account"**
2. Remplissez un faux email : `test@example.com`
3. Remplissez un faux password : `test1234`
4. Remplissez un Display Name : `Test User`
5. **MONTREZ la modal "Terms of Service & EULA"**
   - Scrollez un peu pour montrer le contenu
   - Montrez le checkbox "I agree to..."
   - Montrez le bouton "I Agree & Continue"
6. Cochez le checkbox
7. Cliquez "I Agree & Continue"

**Temps: 0:00 - 0:20**

---

### **Partie 2 : Flag/Report Content (19 sec)**

1. Attendez que l'app charge le feed avec du contenu
2. Sur une vocal card, cliquez le bouton **"..." (trois points)** en haut à droite
3. **MONTREZ la modal "Report / Block"**
4. Cliquez sur le bouton **"Report content"**
5. **MONTREZ la liste des raisons :**
   - "Harassment or bullying"
   - "Hate speech"
   - "Explicit content"
   - "Copyright violation"
   - "Spam or misleading"
   - "Other"
6. Sélectionnez une raison : **"Hate speech"**
7. Cliquez **"Submit Report"**
8. **MONTREZ le toast "Report submitted..."**

**Temps: 0:20 - 0:39**

---

### **Partie 3 : Block User (19 sec)**

1. Allez back au feed (attendre le chargement)
2. Sur une autre vocal card, cliquez le **"..." (trois points)** 
3. Cliquez sur **"Block user"**
4. **MONTREZ la confirmation "Are you sure?"**
5. Cliquez **"Yes, block them"**
6. **MONTREZ le toast "User blocked"**
7. **MONTREZ que la vocal du user bloqué disparaît du feed** (instant removal)

**Temps: 0:39 - 0:58**

---

## **How to Record on iPhone**

### **Méthode 1 : Control Center (Recommandé)**

1. Ouvrez **Settings → Control Center**
2. Ajouter **"Screen Recording"** si absent
3. Swipe depuis le coin haut-droit pour ouvrir Control Center
4. Long-press sur l'icône d'enregistrement (cercle blanc)
5. Sélectionnez **"Microphone Audio: Off"** (pas de son)
6. Cliquez **"Start Recording"** (rouge)
7. Attendez 3 secondes
8. Faites votre démo (58 sec max)
9. Swipe Control Center, cliquez le timer rouge
10. Fichier sauvé dans Photos

### **Méthode 2 : Mac (via Quicktime)**

```bash
# Connecte l'iPhone au Mac
# Ouvrez Quicktime Player
# File → New Movie Recording
# Sélectionnez votre iPhone dans le dropdown
# Cliquez Record
# Faites la démo
# Cliquez Stop
# Exportez en MP4
```

---

## **Vidéo Upload à Apple**

### **1. Préparez le fichier**

- ✅ Format : MP4 ou MOV
- ✅ Durée : < 60 secondes (recommandé 58 sec)
- ✅ Résolution : Native de l'iPhone (1170x2532 pour iPhone 14+)
- ✅ Audio : Mute (silence complet)
- ✅ Pas de watermark

### **2. Upload dans App Store Connect**

1. Allez à : https://appstoreconnect.apple.com
2. Sélectionnez votre app : **VocMe**
3. Onglet : **TestFlight** → **Build Information**
4. Section : **App Review Information**
5. Champ : **Notes**
6. Collez le texte suivant :

```
This video demonstrates the implementation of Guideline 1.2 precautions:

1. EULA/Terms of Service (0:00-0:20)
   - Shows the modal presented before account creation
   - Shows acceptance checkbox and terms content
   - Confirms zero-tolerance policy for abusive content

2. Flag/Report Mechanism (0:20-0:39)
   - Shows how to access the report feature (... menu)
   - Shows 6 predefined report reasons
   - Shows successful report submission notification

3. Block User Mechanism (0:39-0:58)
   - Shows how to block an abusive user
   - Shows blocking confirmation
   - Shows blocked user's content instantly removed from feed

The app maintains a comprehensive database of blocks and reports
for developer review and content moderation.
```

7. **Attachez la vidéo** dans le champ File upload
8. Cliquez **Save**

---

## **Checklist avant submission**

- [ ] Vidéo enregistrée sur un vrai iPhone (pas émulateur)
- [ ] Durée < 60 secondes
- [ ] EULA modal clairement visible
- [ ] Report feature avec 6 raisons visible
- [ ] Block feature avec confirmation visible
- [ ] Blocked user disappears from feed (instant)
- [ ] Toast notifications visibles pour les actions
- [ ] Audio : MUTE (silence complet)
- [ ] Format : MP4 ou MOV
- [ ] Texte descriptif copié dans Notes
- [ ] Vidéo uploadée dans App Store Connect

---

## **Points clés qu'Apple cherche**

Apple va vérifier que :

1. ✅ **EULA montre "zero tolerance for abusive content"**
2. ✅ **Report feature existe** avec raisons spécifiques
3. ✅ **Block feature existe** avec confirmation
4. ✅ **Blocked users removed instantly** (pas besoin de refresh)
5. ✅ **User peut réellement utiliser ces features** (pas fake UI)

---

## **Common Mistakes to Avoid**

- ❌ Vidéo sur émulateur (Apple rejette)
- ❌ Vidéo avec audio (App Store rejette upload)
- ❌ EULA pas visible/lisible
- ❌ Report/Block modals pas clairs
- ❌ Durée > 60 secondes
- ❌ Pas de description dans Notes
- ❌ Vidéo floue/mauvaise qualité

---

## **Next Steps**

1. Filme la vidéo suivant ce guide
2. Upload dans App Store Connect
3. Submit pour review
4. Apple acceptera probablement en 24-48h

**Good luck! 🎬** ✅
