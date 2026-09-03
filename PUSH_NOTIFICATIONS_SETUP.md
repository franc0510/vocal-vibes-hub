# Notifications push — ce qu'il reste à faire à la main

Tout le code est en place. Il manque trois choses que seul le titulaire du
compte Apple peut faire, et une commande de déploiement.

**Tant que ces étapes ne sont pas faites, rien n'arrive sur un téléphone dont
l'application est fermée** — et c'est normal, pas un bug. Les notifications
continuent de s'afficher dans l'application, comme avant.

---

## 1. La clé APNs (portail Apple Developer) — 5 minutes

C'est le même type de clé que celle de Sign in with Apple, au même endroit.

1. <https://developer.apple.com/account/resources/authkeys/list> → **+**
2. Nom : `VocMe Push`. Coche **Apple Push Notifications service (APNs)**.
3. **Continue** → **Register** → **Download**. Tu obtiens un fichier
   `AuthKey_XXXXXXXXXX.p8`.

> ⚠️ Apple ne laisse télécharger ce fichier **qu'une seule fois**. Garde-le.

4. Note le **Key ID** (les 10 caractères du nom du fichier).
5. Ton **Team ID** est déjà connu : `WCJHR98346`.

### Activer la capacité sur l'App ID

<https://developer.apple.com/account/resources/identifiers/list> →
`com.vocme.app` → coche **Push Notifications** → **Save**.

---

## 2. Xcode — 2 minutes

`npm run ios:build`, puis dans Xcode :

1. Cible **App** → onglet **Signing & Capabilities**
2. **+ Capability** → **Push Notifications**

Le fichier d'entitlements et le mode d'arrière-plan sont **déjà** dans le
dépôt, pour les deux configurations. Xcode a seulement besoin d'enregistrer la
capacité auprès du profil de provisionnement.

> Un piège corrigé au passage : l'entitlement n'était référencé que par la
> configuration **Release**. En Debug, l'application se lançait sans lui et
> l'enregistrement échouait en silence — tu aurais cherché longtemps.

---

## 3. Les secrets Supabase — 1 minute

```bash
supabase secrets set APNS_KEY_ID=XXXXXXXXXX
supabase secrets set APNS_TEAM_ID=WCJHR98346
supabase secrets set APNS_PRIVATE_KEY="$(cat ~/Downloads/AuthKey_XXXXXXXXXX.p8)"
# Facultatif : com.vocme.app est la valeur par défaut
supabase secrets set APNS_BUNDLE_ID=com.vocme.app
```

`APNS_SANDBOX=true` bascule vers l'hôte de test d'Apple. À ne poser que si tu
installes un build de développement — un build TestFlight ou App Store parle à
l'hôte de production.

---

## 4. Déployer la fonction d'envoi

```bash
supabase functions deploy send-push
```

`supabase/config.toml` désactive déjà la vérification du jeton pour cette
fonction : c'est la base qui l'appelle, avec la clé de service, et non un
utilisateur connecté.

---

## 5. Brancher la base sur la fonction

La base doit pouvoir appeler la fonction quand une notification est écrite.
Dans le tableau de bord Supabase :

1. **Database → Extensions** → active **`pg_net`**
2. **SQL Editor**, une fois :

```sql
ALTER DATABASE postgres
  SET app.settings.functions_url = 'https://<TON-PROJET>.supabase.co/functions/v1';
ALTER DATABASE postgres
  SET app.settings.service_role_key = '<TA-CLE-DE-SERVICE>';
```

Puis repasse `scripts/sql/appliquer-competitions.sql` : le déclencheur ne
s'installe que si `pg_net` existe, il a donc été sauté au premier passage.

> Le déclencheur ne fait **rien** si ces deux réglages manquent, plutôt que
> d'échouer : une notification doit s'écrire même quand l'envoi n'est pas
> configuré.

---

## 6. Vérifier

Sur un vrai téléphone, application **complètement fermée** :

1. Ouvre l'application une fois, connecté, et accepte les notifications.
2. Vérifie que le jeton est arrivé :
   ```sql
   SELECT user_id, platform, created_at FROM device_tokens WHERE revoked_at IS NULL;
   ```
   Ligne absente → l'enregistrement a échoué. Regarde la console Xcode :
   `📵 Enregistrement push refusé par iOS` indique presque toujours une
   capacité non cochée ou un profil pas régénéré.
3. Ferme l'application. Depuis un autre compte, aime une de tes anecdotes.
4. La bannière doit arriver en quelques secondes.

### Quand ça ne marche pas

| Symptôme | Cause la plus fréquente |
|---|---|
| Aucune ligne dans `device_tokens` | Capacité Push non cochée dans Xcode, ou profil à régénérer |
| Le jeton existe, rien n'arrive | Secrets APNs absents, ou fonction non déployée |
| `revoked_at` se remplit tout seul | Mauvais hôte : build de développement contre l'hôte de production (`APNS_SANDBOX`) |
| Rien ne part, aucune trace | `pg_net` désactivé, ou les deux réglages de l'étape 5 absents |

Les journaux de la fonction (`supabase functions logs send-push`) indiquent le
code et la raison renvoyés par Apple pour chaque échec.

---

## Ce qui marche déjà sans rien de tout ça

Le **rappel du thème à 9 h** est planifié d'avance sur le téléphone lui-même :
il arrive sans serveur, sans réseau, même application fermée, et sans clé APNs.
C'est délibéré — c'est la notification qui compte le plus pour un défi, et la
faire dépendre d'un serveur l'aurait rendue moins fiable, pas plus.
