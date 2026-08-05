# Contribuer à VPZONE Control

Merci de contribuer au projet.

## Proposer une modification

1. Créez un fork du dépôt.
2. Créez une branche courte et descriptive depuis `main`.
3. Installez les dépendances avec `npm install`.
4. Développez et vérifiez la modification avec `npm run check` et `npm run build`.
5. Ouvrez une pull request en expliquant le problème, la solution et la manière de la tester.

Pour une modification visuelle, ajoutez idéalement une capture avant/après. Pour une nouvelle fonctionnalité importante, ouvrez d’abord une issue afin de confirmer son intégration au produit.

## Sécurité et données locales

Ne commitez jamais de jeton OAuth, de secret client, de fichier `.env`, ni le dossier `data/`. Utilisez uniquement un compte de test pour les essais qui pourraient publier un message ou modifier une chaîne.

Si vous découvrez une vulnérabilité, ne créez pas d’issue publique contenant des détails exploitables. Contactez plutôt le propriétaire du dépôt en privé depuis son profil GitHub.
