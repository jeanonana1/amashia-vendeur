# Vérification de la version indépendante

Contrôles effectués le 12 novembre 2026 :

- Installation npm réussie sans forcer les dépendances et sans paquet propriétaire.
- Construction de production Node réussie avec Vite et Nitro.
- Démarrage de la sortie compilée avec Node, hors de l’éditeur.
- Accueil HTTP 200 ; onze illustrations locales valides et toutes les images de l’accueil affichées.
- Page de connexion affichée sur ordinateur et téléphone de 390 pixels de large, sans dépassement horizontal.
- Aucun appel au service de l’éditeur, aucun badge d’édition et aucune erreur JavaScript pendant ces contrôles.
- Sans clé Google personnelle, l’endpoint IA retourne une erreur explicite 503 au lieu de contacter un service de crédits.
- Une commande vide est refusée avec un statut 400 avant tout accès privilégié.
- Contrôles des sources : pas de fichier de secrets, compte précréé, mot de passe enregistré, partage de session avec l’éditeur ou dépendance à son service IA.
- Les six tables publiques incluses disposent de droits explicites et de politiques de contrôle d’accès.

## À vérifier après votre configuration

La compilation a été contrôlée avec des valeurs publiques de validation, non avec les identifiants de votre futur projet. **Aucune migration de données ni mise en ligne externe n’a été exécutée.**

Ces étapes exigent votre projet de données et vos propres accès : exécution du script SQL sur un projet neuf, envoi et réception du vrai email de confirmation, inscription complète, connexion et récupération de mot de passe, téléversement des documents, création/publication d’un produit, achat puis lecture de la commande par le vendeur, génération réelle Google AI et transfert QR téléphone-ordinateur. Elles restent non vérifiées.

Avant ouverture au public : tester l’isolation entre deux vendeurs, vérifier le transfert des anciennes données et images, activer HTTPS, ajouter des limites de requêtes sur les commandes et les appels IA selon votre hébergeur, et vérifier vos mentions légales ainsi que les textes de démonstration.