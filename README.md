# Amachia — version indépendante

Cette archive contient les sources d’Amachia, sans badge d’édition, outil de marquage, partage de session avec l’éditeur, dépendance de construction propriétaire ou appels IA à la plateforme d’origine. Le site conserve son interface et utilise votre propre projet de données et votre compte Google AI.

## 1. Préparer votre projet de données

Créez votre propre projet compatible avec le SDK de données utilisé par l’application. Exécutez `database/setup.sql` **une seule fois sur un projet neuf**, dans l’outil SQL de ce projet. Le script inclut les tables, politiques d’accès, commandes atomiques, déclencheurs et espaces de stockage. Il ne crée aucun compte de test ni mot de passe.

Copiez `.env.example` vers `.env`. Renseignez l’adresse du projet et sa clé publique dans les variables `VITE_` ainsi que les variables serveur correspondantes. Renseignez sa clé d’administration **uniquement dans `SUPABASE_SERVICE_ROLE_KEY` sur le serveur**. Aucun identifiant de l’ancien hébergement n’est inclus.

Activez email/mot de passe et la confirmation email dans le service d’identification. Configurez l’adresse publique du site et autorisez `<votre-domaine>/connexion` comme retour après confirmation. Pour le code à six chiffres de l’inscription, le modèle d’email de confirmation doit afficher `{{ .Token }}`. Configurez un service d’envoi d’emails pour la production. La connexion par téléphone nécessite des comptes disposant d’un numéro vérifié et un fournisseur SMS ; les numéros de contact du profil ne suffisent pas.

L’accès libre du prototype a été supprimé : un mot de passe incorrect ne peut plus modifier ou ouvrir un compte existant. Le formulaire d’inscription garde ses étapes, avec vérification réelle de l’email. Aucun nouveau compte n’est confirmé automatiquement.

## 2. Démarrer et héberger

Prérequis : Node.js 22 et npm. Dans le dossier de l’archive :

```sh
npm ci
npm run dev
```

Pour produire puis démarrer le site sur un VPS, Render, Railway ou un autre hébergeur Node :

```sh
npm run build
node --env-file=.env .output/server/index.mjs
```

La construction doit recevoir les deux variables publiques `VITE_`. Les variables sans préfixe doivent être disponibles au démarrage du serveur. Si votre hébergeur injecte les variables, utilisez simplement `npm start`. Le port par défaut documenté est 3000 ; utilisez le port fourni par votre hébergeur.

Docker :

```sh
docker build --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  -t amashia .
docker run --env-file .env -p 3000:3000 amashia
```

Utilisez HTTPS pour la caméra sur téléphone, les liens QR et la géolocalisation. Sur un VPS, placez un proxy HTTPS devant le port du site. **Ce n’est pas un site statique** : les publications, commandes et IA exigent le serveur Node, donc un simple dépôt HTML sur un hébergement statique ne suffit pas.

## 3. IA indépendante

Renseignez `GOOGLE_API_KEY` uniquement sur le serveur. Les titres, descriptions, angles et photos utilisent directement votre compte Google AI. Les modèles existants sont conservés comme valeurs configurables ; vérifiez leur disponibilité dans votre compte et adaptez les variables `GOOGLE_TEXT_MODEL` et `GOOGLE_IMAGE_MODEL` si nécessaire. Sans clé, seuls les boutons IA restent indisponibles : l’édition manuelle et les ventes ne dépendent pas de l’IA.

Les quotas et coûts dépendent de votre fournisseur, la génération n’est pas illimitée. Les requêtes sont réservées aux vendeurs connectés. Les suggestions SEO n’affirment pas mesurer Google Trends ni scraper Amazon : un accès de recherche réel serait une intégration séparée.

## 4. Données et limites du transfert

**Cette archive contient le code et la structure, pas les comptes existants, produits, commandes, documents privés ou images téléversées des vendeurs.** Exportez vos données depuis l’ancien projet, puis importez-les avec conservation des identifiants et des liens d’appartenance. Transférez séparément les fichiers de `product-images` et `seller-documents` en conservant leurs chemins ; remplacez l’ancienne adresse dans les URL d’images et couvertures enregistrées. Les illustrations fixes du site sont incluses localement quand elles ont pu être téléchargées.

Les comptes doivent être migrés avec leur identifiant original par une procédure d’import sécurisée, ou recréés avec réassociation contrôlée des données ; un simple import des profils ne restaure pas les comptes. Ne réutilisez pas les mots de passe de test. Les sessions de l’ancien site ne sont pas transférées.

Le bouton de publication publie dans la marketplace de **cette application**, accessible à `/p/<identifiant-produit>` ; aucune connexion à un site marketplace externe distinct n’est incluse. Les liens Facebook/TikTok ouvrent leurs services mais ne constituent pas une intégration publicitaire automatique. Les écrans de démonstration déjà présents sont conservés ; cette archive ne transforme pas leurs exemples en données réelles et ne met pas en place un encaissement bancaire ou Mobile Money automatique.

Consultez `VERIFICATION.md` pour les contrôles effectués et ceux restant à effectuer avec votre projet de données.