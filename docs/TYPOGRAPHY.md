# Typographie — police de marque « Amachia » (site vendeur)

## La police
- **Amachia**, police propriétaire dessinée à partir des lettres du logo.
- Quatre graisses, pas d'italique :

| Graisse | Valeur | Classe Tailwind | Usage conseillé |
|---|---|---|---|
| Regular | 400 | `font-normal` (par défaut) | texte courant, descriptions, champs de formulaire |
| Medium | 500 | `font-medium` | libellés, liens, petits textes à mettre légèrement en valeur |
| SemiBold | 600 | `font-semibold` | sous-titres, noms de produits, boutons secondaires, onglets |
| Bold | 700 | `font-bold` | titres, prix, boutons principaux, navigation, badges |

- `font-extrabold` (800) et `font-black` (900) s'affichent en Bold, la graisse la plus proche.

## Fichiers
| Où | Quoi |
|---|---|
| `polices-amachia/` | Fichiers sources (TTF + WOFF) fournis par la marque. Ne pas modifier. |
| `public/fonts/` | Fichiers servis au navigateur : `Amachia-Regular`, `-Medium`, `-SemiBold`, `-Bold`, chacun en `.woff2` et `.woff`. Les WOFF2 sont générés depuis les sources avec fontTools. |

## Où elle est déclarée
- `src/styles.css` : `@font-face`, `--font-sans` et `--font-display` (titres) = Amachia, `font-synthesis: none` sur `html`.
- `src/routes/__root.tsx` : préchargement de Regular et Bold.
- Anciennes polices retirées : Inter et Plus Jakarta Sans (imports `@fontsource-variable/*` supprimés de `styles.css` ; les paquets restent installés mais ne sont plus chargés).
- Les titres `h1`–`h4` gardent leur graisse 800, affichée en Bold (700).
- `size-adjust` (Regular 108 %, Medium 107 %, SemiBold 105 %, Bold 103 %) : même taille visible à l'écran que l'ancienne police.

## Utiliser la police dans un nouveau composant
Rien à faire : la police est héritée partout. Choisissez seulement la graisse avec les classes du tableau ci-dessus. Ne pas écrire de `font-family` en dur : utiliser `font-sans` (ou rien).

## Règle simple
**Regular = texte. Medium = petits accents. SemiBold = sous-titres et boutons secondaires. Bold = titres, prix, boutons principaux.**

## Exceptions volontaires
- Le logo texte « amachia » reste en **Ubuntu Bold** : ne pas le modifier.

## Caractères
La version actuelle (242 caractères) couvre aussi le signe moins « − » et les flèches (→ ← ↑ ↓). Les rares caractères absents sont affichés avec la police de secours du téléphone ou de l'ordinateur.

## Fichiers sources
`polices-amachia/` contient les 4 graisses complètes (TTF + WOFF, version 242 caractères). Les fichiers servis au navigateur sont ceux de `public/fonts/`. Pour mettre la police à jour : remplacer les sources, puis régénérer les WOFF2 de `public/fonts/` avec fontTools (`TTFont(source).flavor = "woff2"`).
