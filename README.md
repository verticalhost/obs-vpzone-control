# VPZONE Control pour OBS

Dock OBS local pour modifier le titre et la catégorie d'une chaîne VPZONE, puis lire et écrire dans le chat en temps réel.

## Installation

Consultez le [guide d’installation](docs/INSTALLATION.md). Pour le moment, la version source nécessite Node.js 20 ou plus récent; un installateur Windows pourra ensuite automatiser ces étapes.

Dans OBS : **Docks → Docks navigateur personnalisés**, nommez-le `VPZONE Control` et utilisez `http://127.0.0.1:4876`.

Dans le dock, cliquez **Se connecter avec VPZONE**, puis approuvez l’autorisation. Le slug de la chaîne est récupéré automatiquement depuis le compte connecté.

Le flux utilise OAuth 2.1 Authorization Code avec PKCE S256. Les jetons sont renouvelés automatiquement avec rotation du refresh token.

L’utilisateur ne génère et ne copie aucun jeton manuellement. Les mainteneurs et développeurs qui utilisent leur propre application OAuth trouveront la configuration complète dans [docs/OAUTH.md](docs/OAUTH.md).

## Alertes OBS

Le dock reçoit en temps réel les dons/Pixels, abonnements, cadeaux, raids, follows, clips et récompenses de points. L’onglet **Alertes** permet de choisir les types actifs, le volume, la durée et de lancer un test.

Ajoutez cette URL comme **Source navigateur** transparente dans une scène OBS :

`http://127.0.0.1:4876/?overlay=alerts`

## Développement

`npm run dev` démarre Vite sur `http://127.0.0.1:5173` et le service API local sur le port 4876.

La configuration et la session OAuth sont enregistrées dans `data/config.json`, uniquement sur la machine locale. Ce dossier est exclu de Git.

## Contribuer

Le projet est public et les contributions sont bienvenues. Consultez [CONTRIBUTING.md](CONTRIBUTING.md) pour proposer une correction ou une fonctionnalité avec une pull request.

Ne publiez jamais le contenu de `data/`, un jeton OAuth, un secret client ou un fichier `.env`. L’identifiant du client OAuth public présent dans l’application n’est pas un secret.

## Licence

Distribué sous licence MIT. Consultez [LICENSE](LICENSE).
