# Configuration OAuth VPZONE

## Pour les utilisateurs

Il n’y a aucun jeton à générer manuellement. Cliquez sur **Se connecter avec VPZONE**, connectez-vous sur VPZONE et acceptez les permissions. L’application effectue ensuite l’échange du code OAuth et le renouvellement des jetons en arrière-plan.

## Pour les mainteneurs et les forks

Une seule application OAuth publique peut servir tous les utilisateurs d’une version distribuée de VPZONE Control. Chaque utilisateur se connecte avec son propre compte, mais utilise le même identifiant public d’application.

Dans le portail développeur VPZONE, créez une application OAuth avec les paramètres suivants :

- Type de client : application publique, sans secret client.
- Flux : Authorization Code avec PKCE S256.
- URL de redirection exacte : `http://localhost:4876/api/auth/callback`.
- Permissions : `profile:read channel:write chat:read chat:write`.

Copiez uniquement le **Client ID** public. Pour utiliser un autre Client ID sans modifier le code, démarrez l’application avec la variable d’environnement `VPZONE_CLIENT_ID` :

```powershell
$env:VPZONE_CLIENT_ID = "votre-client-id-public"
npm start
```

Le projet ne demande pas de `client_secret`. Un secret ne doit jamais être intégré au JavaScript, au dépôt GitHub ou à un futur installateur public.

Si le port est modifié avec la variable `PORT`, l’URL de redirection enregistrée dans le portail VPZONE doit utiliser exactement le même port.

## Cycle de connexion

1. Le serveur local génère un `state`, un vérificateur PKCE et son challenge S256.
2. Le navigateur redirige l’utilisateur vers la page d’autorisation VPZONE.
3. VPZONE renvoie un code temporaire au callback local.
4. Le serveur échange ce code avec le vérificateur PKCE contre un access token et un refresh token.
5. Le refresh token est renouvelé automatiquement lorsque nécessaire.

Les jetons sont conservés dans `data/config.json`, qui est ignoré par Git. Pour révoquer une session locale, déconnectez le compte depuis l’interface; si nécessaire pendant le développement, arrêtez l’application et supprimez uniquement ce fichier local.
