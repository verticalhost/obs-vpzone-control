# Installation dans OBS

VPZONE Control est une application web locale affichée dans un dock navigateur OBS. Ce n’est pas une extension Chrome. La version actuelle n’est pas encore distribuée sous forme de fichier `.exe`.

## Installer la version source

1. Installez Node.js 20 ou une version plus récente.
2. Téléchargez ou clonez le dépôt.
3. Ouvrez PowerShell dans le dossier du projet.
4. Exécutez `npm install`.
5. Exécutez `npm run build`.
6. Démarrez VPZONE Control avec `npm start`, ou avec `start-vpzone-control.ps1` sous Windows.
7. Dans OBS, ouvrez **Docks → Docks navigateur personnalisés**.
8. Ajoutez un dock nommé `VPZONE Control` avec l’URL `http://127.0.0.1:4876`.
9. Cliquez sur **Se connecter avec VPZONE** et autorisez les permissions demandées.

Le navigateur ouvre la page VPZONE officielle. Le mot de passe VPZONE n’est jamais saisi dans VPZONE Control. Après l’autorisation, VPZONE renvoie automatiquement l’application vers `http://localhost:4876/api/auth/callback`.

## Jeton OAuth

L’utilisateur final ne doit pas créer, copier ou coller de jeton. Le bouton de connexion utilise OAuth 2.1 avec PKCE pour obtenir un jeton temporaire, puis le renouveler automatiquement.

La session est enregistrée uniquement dans `data/config.json` sur l’ordinateur de l’utilisateur. Ce fichier contient des données sensibles : ne le partagez pas et ne l’ajoutez jamais à Git.

## Alertes dans une scène

Ajoutez une **Source navigateur** transparente avec l’URL `http://127.0.0.1:4876/?overlay=alerts`.

## Distribution Windows prévue

Un futur installateur Windows devra embarquer le serveur local et les fichiers construits, créer un raccourci et démarrer l’application sur `127.0.0.1:4876`. OBS continuera d’utiliser le même dock navigateur. Une extension Chrome n’est pas nécessaire.
