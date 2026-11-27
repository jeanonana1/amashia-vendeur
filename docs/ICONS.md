# Icônes Amachia

Jeu de 99 icônes propriétaires « Amachia » : style panier-sourire, trait 2 px, grille 24 × 24.

## Où sont les fichiers
| Fichier | Rôle |
|---|---|
| `src/components/icons/AmachiaIcons.tsx` | Les 99 composants React (`<IconPanier />`, `<IconLivraison />`…) et les types `IconProps`, `AmachiaIcon`, `AnyIcon`. |
| `src/components/icons/amachia-icons.css` | Classes d'aide `fond-clair`, `fond-sombre`, `fond-orange` (importé dans `src/styles.css`). |
| `public/icons/amachia/*.svg` | Les mêmes icônes en SVG (couleur `currentColor`) pour les rares endroits sans React. |

Les PNG et les SVG noir/blanc du jeu servent aux visuels (Canva, réseaux sociaux) : ils ne sont pas dans le projet.

## Utiliser une icône
```tsx
import { IconPanier, IconLivraison } from "@/components/icons/AmachiaIcons";

<IconPanier />                                   // 24 px
<IconLivraison size={18} />                      // taille
<IconPanier className="h-5 w-5" />               // taille par classes
<IconFermer title="Fermer" />                    // icône seule dans un bouton : texte accessible
```
Dans le code existant, les icônes ont été remplacées **dans les lignes d'import** (ex. `import { IconPanier as ShoppingCart } from …`) : les balises `<ShoppingCart />` affichent donc l'icône Amachia sans autre changement.

Pour une prop ou une liste qui reçoit une icône (menus, cartes…), utiliser le type `AnyIcon`, qui accepte les icônes Amachia et les icônes lucide encore utilisées.

## Couleur adaptative
- Les icônes utilisent `currentColor` : elles prennent la **couleur du texte** de leur conteneur.
- Ne pas forcer de couleur sur l'icône : régler la couleur du texte de la zone (gris foncé `#2B2B2B` sur fond clair, blanc sur fond sombre).
  Sur les boutons orange d'Amachia, le texte et les icônes restent **noirs** (règle de la marque).
- Si une zone n'a pas de couleur de texte adaptée : classes `fond-clair`, `fond-sombre` ou `fond-orange`.
- Exception : état actif (onglet sélectionné…) en orange avec la prop `color="#E0711C"`.

## Icônes encore fournies par lucide-react
Pas d'équivalent Amachia, ou correspondance douteuse dans ce contexte : Check (25), Loader2 (10), Sparkles (8), TrendingUp (6), Megaphone (5), Circle (4), Users (4), MousePointerClick (4), PackagePlus (3), Zap (3), BellRing (3), Volume2 (3), Rocket (3), ArrowUpRight (3), ExternalLink (3), XCircle (3), PackageCheck (3), MoreHorizontal (2), Sun (2), Moon (2), UserPlus (2), FileText (2), Pause (2), Send (2), LocateFixed (2), PanelLeft (1), GripVertical (1), Calculator (1), Monitor (1), VolumeX (1), AppWindow (1), QrCode (1), ImagePlus (1), Printer (1), Bold (1), Italic (1), Underline (1), Strikethrough (1), ListOrdered (1), Quote (1), Heading1 (1), Heading2 (1), Heading3 (1), Undo (1), Redo (1), AlignLeft (1), AlignCenter (1), AlignRight (1), Type (1), Code (1), BellOff (1), Wand2 (1), Inbox (1), TrendingDown (1), Radio (1), Layers (1), Cloud (1), ArrowDownToLine (1), Landmark (1), History (1), Play (1), Images (1), Ticket (1), Target (1), Repeat (1), AlertCircle (1), CheckCheck (1), Flag (1).
Les étoiles et cœurs **remplis** (notes, favoris actifs) restent en lucide : la version Amachia est un trait et ne peut pas être remplie.

## Les 99 icônes
- **Achat** : `IconPanier` (panier), `IconFavoris` (favoris), `IconSac` (sac), `IconPromo` (promo), `IconCarteCadeau` (carte-cadeau), `IconPourcentage` (pourcentage), `IconPointsFidelite` (points-fidelite)
- **Navigation** : `IconAccueil` (accueil), `IconRecherche` (recherche), `IconMenu` (menu), `IconCategories` (categories), `IconFiltres` (filtres), `IconFermer` (fermer), `IconRetour` (retour), `IconSuivant` (suivant), `IconChevronBas` (chevron-bas), `IconChevronDroite` (chevron-droite), `IconPlus` (plus), `IconMoins` (moins), `IconChevronHaut` (chevron-haut), `IconChevronGauche` (chevron-gauche), `IconVueListe` (vue-liste), `IconTrier` (trier), `IconRafraichir` (rafraichir), `IconLangue` (langue)
- **Compte** : `IconCompte` (compte), `IconBoutique` (boutique), `IconTableauDeBord` (tableau-de-bord), `IconCommandes` (commandes), `IconNotifications` (notifications), `IconMessages` (messages), `IconParametres` (parametres), `IconDeconnexion` (deconnexion), `IconVoir` (voir), `IconMasquer` (masquer), `IconCadenas` (cadenas), `IconEmail` (email)
- **Livraison** : `IconLivraison` (livraison), `IconLivreurMoto` (livreur-moto), `IconColis` (colis), `IconLocalisation` (localisation), `IconHorloge` (horloge), `IconLivraison24h` (livraison-24h), `IconRetourProduit` (retour-produit), `IconCarte` (carte), `IconCalendrier` (calendrier)
- **Paiement** : `IconPortefeuille` (portefeuille), `IconMobileMoney` (mobile-money), `IconEspeces` (especes), `IconCarteBancaire` (carte-bancaire), `IconPaiementSecurise` (paiement-securise), `IconPaiementLivraison` (paiement-livraison)
- **Confiance** : `IconEtoile` (etoile), `IconVerifie` (verifie), `IconServiceClient` (service-client), `IconDiscussion` (discussion), `IconTelephone` (telephone), `IconPartager` (partager), `IconInfo` (info), `IconAide` (aide), `IconLien` (lien), `IconCopier` (copier), `IconValide` (valide), `IconAlerte` (alerte)
- **Catégories** : `IconTelephones` (telephones), `IconMode` (mode), `IconMaison` (maison), `IconBeaute` (beaute), `IconAlimentation` (alimentation), `IconElectronique` (electronique), `IconInformatique` (informatique), `IconElectromenager` (electromenager), `IconModeFemme` (mode-femme), `IconChaussures` (chaussures), `IconMontres` (montres), `IconBijoux` (bijoux), `IconSante` (sante), `IconBoissons` (boissons), `IconCuisine` (cuisine), `IconJardin` (jardin), `IconBricolage` (bricolage), `IconJouets` (jouets), `IconLivres` (livres), `IconJeuxVideo` (jeux-video), `IconAnimaux` (animaux), `IconAgriculture` (agriculture), `IconAudio` (audio), `IconSport` (sport), `IconBebe` (bebe), `IconAuto` (auto)
- **Vendeur** : `IconModifier` (modifier), `IconSupprimer` (supprimer), `IconAjouterProduit` (ajouter-produit), `IconImage` (image), `IconAppareilPhoto` (appareil-photo), `IconImporter` (importer), `IconTelecharger` (telecharger), `IconStatistiques` (statistiques), `IconStock` (stock)
