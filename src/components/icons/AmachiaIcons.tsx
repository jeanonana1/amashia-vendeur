import * as React from "react";

/** Jeu d'icônes Amachia — style « panier-sourire », version normale.
 *  Couleur ADAPTATIVE : l'icône prend la couleur du texte autour d'elle (currentColor).
 *  Sur fond clair (texte foncé) elle est foncée, sur fond sombre (texte blanc) elle est blanche.
 *  Forcer une couleur : prop `color` (ex. color="#E0711C") ou classe CSS (ex. text-white). Taille : prop `size`. */
export type IconProps = React.SVGProps<SVGSVGElement> & { size?: number; color?: string; title?: string };
/** Type d'un composant d'icône Amachia. */
export type AmachiaIcon = (p: IconProps) => React.JSX.Element;
/** Type commun aux icônes Amachia et aux icônes lucide encore utilisées (listes de menus, cartes…). */
export type AnyIcon = React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties; strokeWidth?: number | string; color?: string; "aria-hidden"?: boolean | "true" | "false" }>;

function Base({ size = 24, color, title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="amachia-icon" style={color ? { color } : undefined}
         role={title ? "img" : undefined}
         aria-hidden={title ? undefined : true} {...props}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconPanier = (p: IconProps) => (
  <Base {...p}>{(p.size ?? 24) <= 18 ? <><g transform="translate(0.81 1.15) scale(0.94)"><path d="M2.6 2.6H4.6C5.1 2.6 5.5 2.9 5.6 3.4L7.8 7.4" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" /><path d="M7.8 7.4Q15.2 12.2 22.6 7.4Q15.2 24.4 7.8 7.4Z" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" /><path d="M1.60 10.6H5.85" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /><path d="M2.80 13.8H8.01" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" /><circle cx="11.6" cy="20.0" r="1.75" fill="currentColor" /><circle cx="19.4" cy="20.0" r="1.75" fill="currentColor" /></g></> : <><g transform="translate(0.81 1.15) scale(0.94)"><path d="M2.6 2.6H4.6C5.1 2.6 5.5 2.9 5.6 3.4L7.8 7.4" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinejoin="round" strokeLinecap="round" /><path d="M7.8 7.4Q15.2 12.2 22.6 7.4Q15.2 24.4 7.8 7.4Z" fill="none" stroke="currentColor" strokeWidth="2.0" strokeLinejoin="round" /><path d="M3.40 9.8H5.82" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" /><path d="M1.40 12.3H7.29" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" /><path d="M3.80 14.8H9.44" stroke="currentColor" strokeWidth="2.0" strokeLinecap="round" /><circle cx="11.6" cy="20.0" r="1.65" fill="currentColor" /><circle cx="19.4" cy="20.0" r="1.65" fill="currentColor" /></g></>}</Base>
);
export const IconFavoris = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20C12 20 3.5 14.9 3.5 9.2C3.5 6.4 5.6 4.5 8 4.5C9.7 4.5 11.2 5.5 12 7C12.8 5.5 14.3 4.5 16 4.5C18.4 4.5 20.5 6.4 20.5 9.2C20.5 14.9 12 20 12 20Z" /></g></Base>;
export const IconSac = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8H19L19.8 19.4C19.85 20 19.4 20.5 18.8 20.5H5.2C4.6 20.5 4.15 20 4.2 19.4Z" /><path d="M8.5 10.5V7C8.5 5 10 3.5 12 3.5S15.5 5 15.5 7V10.5" /><path d="M9 13.8Q12 16.8 15 13.8" /></g></Base>;
export const IconPromo = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 12.4V5C3.5 4.2 4.2 3.5 5 3.5H12.4C12.8 3.5 13.2 3.7 13.5 4L20.2 10.7C20.8 11.3 20.8 12.2 20.2 12.8L12.8 20.2C12.2 20.8 11.3 20.8 10.7 20.2L4 13.5C3.7 13.2 3.5 12.8 3.5 12.4Z" /><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /><path d="M10.2 12.6Q12.6 15 15 12.6" /></g></Base>;
export const IconCarteCadeau = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8.5" width="18" height="12" rx="2" /><path d="M3 13H21M12 8.5V20.5" /><path d="M12 8.5C10.6 5.4 7.4 4.6 7.4 6.6C7.4 8.2 10 8.5 12 8.5C14 8.5 16.6 8.2 16.6 6.6C16.6 4.6 13.4 5.4 12 8.5Z" /></g></Base>;
export const IconAccueil = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 10.5L12 3.5L20.5 10.5" /><path d="M5.5 9V19.5C5.5 20.05 5.95 20.5 6.5 20.5H17.5C18.05 20.5 18.5 20.05 18.5 19.5V9" /><path d="M9 14.2Q12 17.4 15 14.2" /></g></Base>;
export const IconRecherche = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.4 15.4L20.5 20.5" /><path d="M7.9 10.4Q10.5 13.4 13.1 10.4" /></g></Base>;
export const IconMenu = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5H20M4 12H20M4 17.5H14" /></g></Base>;
export const IconCategories = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><circle cx="17" cy="17" r="3.5" /></g></Base>;
export const IconFiltres = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7H10.5M15.5 7H20M4 17H7.5M12.5 17H20" /><circle cx="13" cy="7" r="2.5" /><circle cx="10" cy="17" r="2.5" /></g></Base>;
export const IconFermer = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6L18 18M18 6L6 18" /></g></Base>;
export const IconRetour = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 12H4.5M10.5 6L4.5 12L10.5 18" /></g></Base>;
export const IconSuivant = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12H19.5M13.5 6L19.5 12L13.5 18" /></g></Base>;
export const IconChevronBas = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5L12 15.5L18 9.5" /></g></Base>;
export const IconChevronDroite = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 6L15.5 12L9.5 18" /></g></Base>;
export const IconPlus = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5V19M5 12H19" /></g></Base>;
export const IconMoins = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12H19" /></g></Base>;
export const IconCompte = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4.3" /><path d="M10.1 8.4Q12 10.6 13.9 8.4" /><path d="M4.5 20.5C5.2 16.5 8.2 14 12 14S18.8 16.5 19.5 20.5" /></g></Base>;
export const IconBoutique = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9Q5.25 12 7.5 9Q9.75 12 12 9Q14.25 12 16.5 9Q18.75 12 21 9" /><path d="M3 9L4 4H20L21 9" /><path d="M4.5 11.5V20.5H19.5V11.5" /><path d="M10 20.5V15.5H14V20.5" /></g></Base>;
export const IconTableauDeBord = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="9" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="15.5" width="7" height="5" rx="2" /></g></Base>;
export const IconCommandes = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5H18V20.5L15.8 19L13.9 20.5L12 19L10.1 20.5L8.2 19L6 20.5Z" /><path d="M9 8H15M9 11.5H15M9 15H12.5" /></g></Base>;
export const IconNotifications = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 16.5V11C6 7.7 8.7 5 12 5S18 7.7 18 11V16.5L19.5 18.5H4.5Z" /><path d="M10 21Q12 22.4 14 21" /><path d="M12 2.5V5" /></g></Base>;
export const IconMessages = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6.5C4 5.1 5.1 4 6.5 4H17.5C18.9 4 20 5.1 20 6.5V14C20 15.4 18.9 16.5 17.5 16.5H10.5L6 20V16.5C4.9 16.5 4 15.4 4 14Z" /><path d="M8.5 9.4Q12 12.8 15.5 9.4" /></g></Base>;
export const IconParametres = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.86 10.61L21.13 10.90L21.13 13.10L18.86 13.39L17.83 15.87L19.24 17.68L17.68 19.24L15.87 17.83L13.39 18.86L13.10 21.13L10.90 21.13L10.61 18.86L8.13 17.83L6.32 19.24L4.76 17.68L6.17 15.87L5.14 13.39L2.87 13.10L2.87 10.90L5.14 10.61L6.17 8.13L4.76 6.32L6.32 4.76L8.13 6.17L10.61 5.14L10.90 2.87L13.10 2.87L13.39 5.14L15.87 6.17L17.68 4.76L19.24 6.32L17.83 8.13Z" /><circle cx="12" cy="12" r="3" /></g></Base>;
export const IconDeconnexion = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 4H6.5C5.4 4 4.5 4.9 4.5 6V18C4.5 19.1 5.4 20 6.5 20H10" /><path d="M10 12H20M16 8L20 12L16 16" /></g></Base>;
export const IconLivraison = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 15.5V6.5C14.5 5.9 14.1 5.5 13.5 5.5H3.5C2.9 5.5 2.5 5.9 2.5 6.5V16.5C2.5 17.1 2.9 17.5 3.5 17.5H4.6" /><path d="M9.4 17.5H15.1" /><path d="M14.5 8.5H18L21.5 12.5V16.5C21.5 17.1 21.1 17.5 20.5 17.5H19.9" /><circle cx="7" cy="17.5" r="2.2" /><circle cx="17.5" cy="17.5" r="2.2" /><path d="M5.5 9.6Q8.5 12.8 11.5 9.6" /></g></Base>;
export const IconLivreurMoto = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.8" y="3.6" width="7.4" height="5.8" rx="1.4" /><path d="M6.5 9.4V11.4" /><path d="M3 15.2C3 12.9 4.8 11.4 7 11.4H11.6L13 15.6H9.2" /><path d="M13 15.6H15.2L17.4 6.2M15.5 6.2H19.4M17.1 8.6L18.5 15" /><circle cx="6" cy="17.6" r="2.3" /><circle cx="18.6" cy="17.6" r="2.3" /></g></Base>;
export const IconColis = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L20.5 7.5V16.5L12 21L3.5 16.5V7.5Z" /><path d="M3.5 7.5L12 12L20.5 7.5M12 12V21" /><path d="M7.75 5.25L16.25 9.75" /><path d="M5.6 13.2Q7.3 16.6 9.6 15.6" /></g></Base>;
export const IconLocalisation = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21C12 21 5 14.6 5 9.6C5 5.7 8.1 3 12 3S19 5.7 19 9.6C19 14.6 12 21 12 21Z" /><circle cx="12" cy="9.6" r="2.5" /></g></Base>;
export const IconHorloge = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12L15 14" /></g></Base>;
export const IconLivraison24h = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 12A8.5 8.5 0 1 1 17.6 5.6" /><path d="M17.9 2.6L17.9 5.9L14.6 5.9" /><path d="M12 7.5V12L15 14" /></g></Base>;
export const IconRetourProduit = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 4L4.5 8L8.5 12" /><path d="M4.5 8H14C17.3 8 20 10.7 20 14S17.3 20 14 20H9" /></g></Base>;
export const IconPortefeuille = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="6.5" width="17" height="14" rx="2.5" /><path d="M6 6.5L15.5 3.6L16.6 6.5" /><path d="M15 11.5H20.5V15.5H15C13.9 15.5 13 14.6 13 13.5S13.9 11.5 15 11.5Z" /><circle cx="15.4" cy="13.5" r="0.9" fill="currentColor" stroke="none" /></g></Base>;
export const IconMobileMoney = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="9.5" height="18" rx="2.2" /><path d="M7.6 17.6H9.9" /><path d="M16 8.5H20.5M18.5 6.5L20.5 8.5L18.5 10.5" /><path d="M20.5 14.5H16M18 12.5L16 14.5L18 16.5" /></g></Base>;
export const IconEspeces = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" /></g></Base>;
export const IconCarteBancaire = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5H21.5" /><path d="M6 15H10" /></g></Base>;
export const IconPaiementSecurise = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L19.5 6V11.5C19.5 16 16.3 19.6 12 21C7.7 19.6 4.5 16 4.5 11.5V6Z" /><path d="M8.6 12L11 14.4L15.4 9.6" /></g></Base>;
export const IconPaiementLivraison = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="9" width="13" height="9" rx="1.8" /><circle cx="9" cy="13.5" r="1.9" /><path d="M15.5 11.5H18.5L21.5 14.5V18H15.5" /><circle cx="6.5" cy="19.2" r="1.4" /><circle cx="18.5" cy="19.2" r="1.4" /></g></Base>;
export const IconEtoile = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.41 4.98Q12.00 3.60 12.59 4.98L14.14 8.64Q14.41 9.28 15.11 9.34L19.07 9.69Q20.56 9.82 19.43 10.80L16.43 13.41Q15.90 13.87 16.06 14.55L16.95 18.42Q17.29 19.88 16.00 19.11L12.60 17.06Q12.00 16.70 11.40 17.06L8.00 19.11Q6.71 19.88 7.05 18.42L7.94 14.55Q8.10 13.87 7.57 13.41L4.57 10.80Q3.44 9.82 4.93 9.69L8.89 9.34Q9.59 9.28 9.86 8.64Z" /></g></Base>;
export const IconVerifie = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.15 12.00L21.08 12.36L20.87 12.70L20.57 13.01L20.20 13.30L19.82 13.56L19.49 13.80L19.23 14.04L19.09 14.30L19.05 14.60L19.11 14.95L19.24 15.34L19.40 15.77L19.53 16.21L19.59 16.65L19.55 17.05L19.40 17.38L19.13 17.62L18.77 17.78L18.33 17.85L17.87 17.87L17.41 17.86L17.00 17.85L16.65 17.90L16.38 18.03L16.17 18.25L16.02 18.56L15.90 18.96L15.77 19.40L15.61 19.83L15.41 20.22L15.14 20.52L14.83 20.70L14.47 20.74L14.08 20.66L13.68 20.46L13.30 20.20L12.94 19.92L12.60 19.68L12.30 19.51L12.00 19.45L11.70 19.51L11.40 19.68L11.06 19.92L10.70 20.20L10.32 20.46L9.92 20.66L9.53 20.74L9.17 20.70L8.86 20.52L8.59 20.22L8.39 19.83L8.23 19.40L8.10 18.96L7.98 18.56L7.83 18.25L7.62 18.03L7.35 17.90L7.00 17.85L6.59 17.86L6.13 17.87L5.67 17.85L5.23 17.78L4.87 17.62L4.60 17.38L4.45 17.05L4.41 16.65L4.47 16.21L4.60 15.77L4.76 15.34L4.89 14.95L4.95 14.60L4.91 14.30L4.77 14.04L4.51 13.80L4.18 13.56L3.80 13.30L3.43 13.01L3.13 12.70L2.92 12.36L2.85 12.00L2.92 11.64L3.13 11.30L3.43 10.99L3.80 10.70L4.18 10.44L4.51 10.20L4.77 9.96L4.91 9.70L4.95 9.40L4.89 9.05L4.76 8.66L4.60 8.23L4.47 7.79L4.41 7.35L4.45 6.95L4.60 6.62L4.87 6.38L5.23 6.22L5.67 6.15L6.13 6.13L6.59 6.14L7.00 6.15L7.35 6.10L7.62 5.97L7.83 5.75L7.98 5.44L8.10 5.04L8.23 4.60L8.39 4.17L8.59 3.78L8.86 3.48L9.17 3.30L9.53 3.26L9.92 3.34L10.32 3.54L10.70 3.80L11.06 4.08L11.40 4.32L11.70 4.49L12.00 4.55L12.30 4.49L12.60 4.32L12.94 4.08L13.30 3.80L13.68 3.54L14.08 3.34L14.47 3.26L14.83 3.30L15.14 3.48L15.41 3.78L15.61 4.17L15.77 4.60L15.90 5.04L16.02 5.44L16.17 5.75L16.38 5.97L16.65 6.10L17.00 6.15L17.41 6.14L17.87 6.13L18.33 6.15L18.77 6.22L19.13 6.38L19.40 6.62L19.55 6.95L19.59 7.35L19.53 7.79L19.40 8.23L19.24 8.66L19.11 9.05L19.05 9.40L19.09 9.70L19.23 9.96L19.49 10.20L19.82 10.44L20.20 10.70L20.57 10.99L20.87 11.30L21.08 11.64Z" /><path d="M8.4 12.2L10.9 14.7L15.6 9.6" /></g></Base>;
export const IconServiceClient = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12.8" r="4.6" /><circle cx="10.3" cy="11.8" r="0.85" fill="currentColor" stroke="none" /><circle cx="13.7" cy="11.8" r="0.85" fill="currentColor" stroke="none" /><path d="M10 14.1Q12 16.3 14 14.1" /><path d="M4 12.6C4 8.2 7.6 4.6 12 4.6S20 8.2 20 12.6" /><rect x="2.6" y="11" width="2.8" height="5" rx="1.2" /><rect x="18.6" y="11" width="2.8" height="5" rx="1.2" /><path d="M20 16C20 18.4 18.4 20 16 20H14.2" /></g></Base>;
export const IconDiscussion = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5C16.7 3.5 20.5 7 20.5 11.5S16.7 19.5 12 19.5C10.6 19.5 9.3 19.2 8.1 18.6L4 20L5.2 16.3C4.1 14.9 3.5 13.3 3.5 11.5C3.5 7 7.3 3.5 12 3.5Z" /><path d="M8.5 10.6Q12 14.4 15.5 10.6" /></g></Base>;
export const IconTelephone = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4.6C5 4 5.4 3.5 6 3.5H8.6C9.1 3.5 9.5 3.8 9.6 4.3L10.4 7.8C10.5 8.2 10.3 8.6 10 8.9L8.4 10.2C9.5 12.6 11.4 14.5 13.8 15.6L15.1 14C15.4 13.7 15.8 13.5 16.2 13.6L19.7 14.4C20.2 14.5 20.5 14.9 20.5 15.4V18C20.5 18.6 20 19 19.5 19C11.5 19 5 12.5 5 4.6Z" /></g></Base>;
export const IconPartager = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="18.5" r="2.5" /><path d="M8.2 10.8L15.8 6.7M8.2 13.2L15.8 17.3" /></g></Base>;
export const IconInfo = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 11V16.5" /><circle cx="12" cy="7.8" r="1.1" fill="currentColor" stroke="none" /></g></Base>;
export const IconAide = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6C9.6 8.2 10.7 7.1 12 7.1S14.4 8.2 14.4 9.5C14.4 11.2 12 11.4 12 13.3" /><circle cx="12" cy="16.6" r="1.1" fill="currentColor" stroke="none" /></g></Base>;
export const IconTelephones = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.3H13.5" /></g></Base>;
export const IconMode = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 3.5L3.5 6.5L5.5 10.5L7.5 9.6V20.5H16.5V9.6L18.5 10.5L20.5 6.5L15.5 3.5C15.2 5.4 13.8 6.6 12 6.6S8.8 5.4 8.5 3.5Z" /></g></Base>;
export const IconMaison = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10V8C5 6.9 5.9 6 7 6H17C18.1 6 19 6.9 19 8V10" /><path d="M3.5 11.8C3.5 10.8 4.2 10 5 10S6.5 10.8 6.5 11.8V13.5H17.5V11.8C17.5 10.8 18.2 10 19 10S20.5 10.8 20.5 11.8V17.5H3.5Z" /><path d="M5.5 17.5V19.8M18.5 17.5V19.8" /></g></Base>;
export const IconBeaute = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10.5H17V19C17 19.8 16.3 20.5 15.5 20.5H8.5C7.7 20.5 7 19.8 7 19Z" /><path d="M9.5 10.5V7.5H14.5V10.5" /><path d="M10.5 7.5V3.5H13.5V7.5" /><path d="M9.6 14Q12 16.6 14.4 14" /></g></Base>;
export const IconAlimentation = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 7.6C10 6 5 6 5 11.6C5 16 8 20.5 10.5 20.5C11.2 20.5 11.5 20 12 20S12.8 20.5 13.5 20.5C16 20.5 19 16 19 11.6C19 6 14 6 12 7.6Z" /><path d="M12 7.6C12 5.2 13.5 3.5 15.6 3.5C15.6 5.6 14.1 7.2 12 7.6Z" /></g></Base>;
export const IconElectronique = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="12.5" rx="2" /><path d="M9 20.5H15M12 17V20.5" /></g></Base>;
export const IconChevronHaut = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 14.5L12 8.5L18 14.5" /></g></Base>;
export const IconChevronGauche = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6L8.5 12L14.5 18" /></g></Base>;
export const IconVueListe = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 6H20M8.5 12H20M8.5 18H20" /><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" /></g></Base>;
export const IconTrier = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4.5V19.5M3.5 8L7 4.5L10.5 8" /><path d="M17 19.5V4.5M13.5 16L17 19.5L20.5 16" /></g></Base>;
export const IconRafraichir = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19.5 12A7.5 7.5 0 1 1 17.3 6.7" /><path d="M18.2 3.2V7H14.4" /></g></Base>;
export const IconLangue = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12H20.5" /><path d="M12 3.5C14.4 6 15.5 9 15.5 12S14.4 18 12 20.5C9.6 18 8.5 15 8.5 12S9.6 6 12 3.5Z" /></g></Base>;
export const IconPourcentage = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="2.3" /><circle cx="17" cy="17" r="2.3" /><path d="M18.5 5.5L5.5 18.5" /></g></Base>;
export const IconPointsFidelite = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M11.42 9.48Q12.00 8.10 12.58 9.48L12.90 10.24Q13.18 10.88 13.87 10.94L14.69 11.01Q16.18 11.14 15.05 12.12L14.43 12.66Q13.90 13.12 14.06 13.80L14.25 14.60Q14.59 16.06 13.30 15.29L12.60 14.86Q12.00 14.50 11.40 14.86L10.70 15.29Q9.41 16.06 9.75 14.60L9.94 13.80Q10.10 13.12 9.57 12.66L8.95 12.12Q7.82 11.14 9.31 11.01L10.13 10.94Q10.82 10.88 11.10 10.24Z" /></g></Base>;
export const IconCarte = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 6.5L8.5 4.5L15.5 7L20.5 5V17.5L15.5 19.5L8.5 17L3.5 19Z" /><path d="M8.5 4.5V17M15.5 7V19.5" /></g></Base>;
export const IconCalendrier = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10H20.5M8 3V7M16 3V7" /><circle cx="8" cy="14.2" r="1.1" fill="currentColor" stroke="none" /><circle cx="12" cy="14.2" r="1.1" fill="currentColor" stroke="none" /><circle cx="16" cy="14.2" r="1.1" fill="currentColor" stroke="none" /></g></Base>;
export const IconModifier = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.6 5.4L18.6 9.4L9.2 18.8H5.2V14.8Z" /><path d="M12.6 7.4L16.6 11.4" /></g></Base>;
export const IconSupprimer = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 7H19.5" /><path d="M9.5 7V4.5H14.5V7" /><path d="M6.5 7L7.5 19.4C7.55 20 8 20.5 8.6 20.5H15.4C16 20.5 16.45 20 16.5 19.4L17.5 7" /><path d="M10.2 11V16.5M13.8 11V16.5" /></g></Base>;
export const IconAjouterProduit = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5" /><path d="M12 8V16M8 12H16" /></g></Base>;
export const IconImage = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="M3.5 17L9 12L13 15.5L16 13L20.5 16.5" /></g></Base>;
export const IconAppareilPhoto = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 7.5H7.5L9 5H15L16.5 7.5H19.5C20.3 7.5 21 8.2 21 9V18C21 18.8 20.3 19.5 19.5 19.5H4.5C3.7 19.5 3 18.8 3 18V9C3 8.2 3.7 7.5 4.5 7.5Z" /><circle cx="12" cy="13.2" r="3.4" /></g></Base>;
export const IconImporter = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M7.5 8.5L12 4L16.5 8.5" /><path d="M4.5 15.5V18.5C4.5 19.6 5.4 20.5 6.5 20.5H17.5C18.6 20.5 19.5 19.6 19.5 18.5V15.5" /></g></Base>;
export const IconTelecharger = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4V15M7.5 10.5L12 15L16.5 10.5" /><path d="M4.5 15.5V18.5C4.5 19.6 5.4 20.5 6.5 20.5H17.5C18.6 20.5 19.5 19.6 19.5 18.5V15.5" /></g></Base>;
export const IconStatistiques = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 20.5H20.5" /><rect x="5" y="14.5" width="3" height="3.5" rx="0.9" /><rect x="10.5" y="12" width="3" height="6" rx="0.9" /><rect x="16" y="9.5" width="3" height="8.5" rx="0.9" /><path d="M4.5 10.5L9.5 6.5L13 8.5L19.5 3.8" /><path d="M16.4 3.6H19.6V6.8" /></g></Base>;
export const IconStock = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.4L12 4L21 9.4V20.5H3Z" /><rect x="6.5" y="14.5" width="5" height="6" rx="0.9" /><rect x="12.5" y="14.5" width="5" height="6" rx="0.9" /><rect x="9.5" y="9.5" width="5" height="5" rx="0.9" /></g></Base>;
export const IconVoir = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12C4.5 7.8 8 5.5 12 5.5S19.5 7.8 21.5 12C19.5 16.2 16 18.5 12 18.5S4.5 16.2 2.5 12Z" /><circle cx="12" cy="12" r="3" /></g></Base>;
export const IconMasquer = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12C4.5 7.8 8 5.5 12 5.5S19.5 7.8 21.5 12C19.5 16.2 16 18.5 12 18.5S4.5 16.2 2.5 12Z" /><circle cx="12" cy="12" r="3" /><path d="M4 4L20 20" /></g></Base>;
export const IconCadenas = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V7.5C8 5.3 9.8 3.5 12 3.5S16 5.3 16 7.5V10.5" /><path d="M12 14.5V16.5" /></g></Base>;
export const IconEmail = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3.8 7L12 13L20.2 7" /></g></Base>;
export const IconLien = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14L14 10" /><path d="M8.6 11.6L6.6 13.6C5.2 15 5.2 17.4 6.6 18.8C8 20.2 10.4 20.2 11.8 18.8L13.8 16.8" /><path d="M10.2 7.2L12.2 5.2C13.6 3.8 16 3.8 17.4 5.2C18.8 6.6 18.8 9 17.4 10.4L15.4 12.4" /></g></Base>;
export const IconCopier = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8.5" y="8.5" width="12" height="12" rx="2.2" /><path d="M15.5 5.5V5C15.5 4.2 14.8 3.5 14 3.5H5C4.2 3.5 3.5 4.2 3.5 5V14C3.5 14.8 4.2 15.5 5 15.5H5.5" /></g></Base>;
export const IconValide = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.2L10.8 14.7L15.7 9.7" /></g></Base>;
export const IconAlerte = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.9C11 3.6 13 3.6 13.7 4.9L20.6 17.3C21.3 18.6 20.4 20 19 20H5C3.6 20 2.7 18.6 3.4 17.3Z" /><path d="M12 9.5V13.5" /><circle cx="12" cy="16.6" r="1.1" fill="currentColor" stroke="none" /></g></Base>;
export const IconInformatique = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="5" width="15" height="10.5" rx="1.8" /><path d="M2.5 19H21.5" /></g></Base>;
export const IconElectromenager = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M4.5 7.5H19.5" /><circle cx="12" cy="14.2" r="3.8" /><circle cx="7.6" cy="5.3" r="0.9" fill="currentColor" stroke="none" /><circle cx="10.2" cy="5.3" r="0.9" fill="currentColor" stroke="none" /></g></Base>;
export const IconModeFemme = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.2 3.5H14.8L14.2 7.8L18.6 20.5H5.4L9.8 7.8Z" /><path d="M9.8 7.8H14.2" /></g></Base>;
export const IconChaussures = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15.5V8.6C3 8 3.4 7.6 4 7.6H7.6C7.8 9 9 10 10.5 10L19 13.3C20.2 13.8 21 14.9 21 16.2" /><path d="M3 15.5H21V18.4C21 19 20.6 19.4 20 19.4H4C3.4 19.4 3 19 3 18.4Z" /><path d="M11.2 10.3L12.2 11.8M14 11.4L15 12.8" /></g></Base>;
export const IconMontres = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><path d="M9 7.7L9.6 3.5H14.4L15 7.7M9 16.3L9.6 20.5H14.4L15 16.3" /><path d="M12 9.8V12L13.4 13.2" /></g></Base>;
export const IconBijoux = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="15.2" r="5.3" /><path d="M9 6.8L10.5 4H13.5L15 6.8L12 9.9Z" /></g></Base>;
export const IconSante = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 4.5H14.5V9.5H19.5V14.5H14.5V19.5H9.5V14.5H4.5V9.5H9.5Z" /></g></Base>;
export const IconBoissons = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5H14V7L15.6 9.6V19.5C15.6 20.05 15.15 20.5 14.6 20.5H9.4C8.85 20.5 8.4 20.05 8.4 19.5V9.6L10 7Z" /><path d="M8.4 13H15.6" /></g></Base>;
export const IconCuisine = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5H17V17C17 18.9 15.4 20.5 13.5 20.5H7.5C5.6 20.5 4 18.9 4 17Z" /><path d="M17 12.5H20.8" /><path d="M8.2 7.6C8.2 6.6 9 6.1 9 5M12.6 7.6C12.6 6.6 13.4 6.1 13.4 5" /></g></Base>;
export const IconJardin = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 13.5H17L15.8 20.5H8.2Z" /><path d="M12 13.5V8" /><path d="M12 9.6C12 6.6 9.5 4.6 6.5 4.6C6.5 7.6 9 9.6 12 9.6Z" /><path d="M12 8.2C12 5.6 14 3.6 17.5 3.6C17.5 6.6 15 8.2 12 8.2Z" /></g></Base>;
export const IconBricolage = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.6 3.4C12.6 4 11.4 6 11.9 8L4.6 15.3C3.8 16.1 3.8 17.4 4.6 18.2L5.8 19.4C6.6 20.2 7.9 20.2 8.7 19.4L16 12.1C18 12.6 20 11.4 20.6 9.4L18 10.2L16 9.4L15.2 7.4L16 4.8C15.5 3.4 14.6 3.4 14.6 3.4Z" /></g></Base>;
export const IconJouets = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13.6" r="6.2" /><path d="M7.2 9.3A2.6 2.6 0 1 1 10 7.6" /><path d="M14 7.6A2.6 2.6 0 1 1 16.8 9.3" /><circle cx="9.8" cy="12.6" r="0.95" fill="currentColor" stroke="none" /><circle cx="14.2" cy="12.6" r="0.95" fill="currentColor" stroke="none" /><path d="M10.2 15.6Q12 17.4 13.8 15.6" /></g></Base>;
export const IconLivres = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.5C10 5 7 4.5 3.5 5V18.5C7 18 10 18.5 12 20C14 18.5 17 18 20.5 18.5V5C17 4.5 14 5 12 6.5Z" /><path d="M12 6.5V20" /></g></Base>;
export const IconJeuxVideo = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 7.5H16.5C19 7.5 21 9.5 21 12V15.5C21 17.2 19.7 18.5 18 18.5C16.9 18.5 16 17.9 15.5 17L14.6 15.5H9.4L8.5 17C8 17.9 7.1 18.5 6 18.5C4.3 18.5 3 17.2 3 15.5V12C3 9.5 5 7.5 7.5 7.5Z" /><path d="M7.5 10.6V13.6M6 12.1H9" /><circle cx="15.6" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="17.6" cy="13.1" r="1" fill="currentColor" stroke="none" /></g></Base>;
export const IconAnimaux = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.2C9.5 20.2 7.6 18.8 7.6 16.8C7.6 14.6 9.6 12.6 12 12.6S16.4 14.6 16.4 16.8C16.4 18.8 14.5 20.2 12 20.2Z" /><circle cx="5.8" cy="11.2" r="1.8" /><circle cx="9.4" cy="7" r="1.9" /><circle cx="14.6" cy="7" r="1.9" /><circle cx="18.2" cy="11.2" r="1.8" /></g></Base>;
export const IconAgriculture = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21V7.5" /><path d="M12 10.4C10.1 10.4 8.6 8.9 8.6 7C10.5 7 12 8.5 12 10.4Z" /><path d="M12 10.4C13.9 10.4 15.4 8.9 15.4 7C13.5 7 12 8.5 12 10.4Z" /><path d="M12 15.2C10.1 15.2 8.6 13.7 8.6 11.8C10.5 11.8 12 13.3 12 15.2Z" /><path d="M12 15.2C13.9 15.2 15.4 13.7 15.4 11.8C13.5 11.8 12 13.3 12 15.2Z" /><path d="M12 7.5C12 5.6 12 4.4 12 3.5" /></g></Base>;
export const IconAudio = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 15V12C4.5 7.9 7.9 4.5 12 4.5S19.5 7.9 19.5 12V15" /><rect x="3.5" y="13.5" width="4" height="6.8" rx="1.6" /><rect x="16.5" y="13.5" width="4" height="6.8" rx="1.6" /></g></Base>;
export const IconSport = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 7.5V16.5M17.5 7.5V16.5M3.5 10V14M20.5 10V14M6.5 12H17.5" /></g></Base>;
export const IconBebe = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.8 10H15.2V19C15.2 19.8 14.5 20.5 13.7 20.5H10.3C9.5 20.5 8.8 19.8 8.8 19Z" /><path d="M10 10V7.6H14V10" /><path d="M11 7.6C11 5.2 11.5 3.5 12 3.5S13 5.2 13 7.6" /><path d="M8.8 13.4H11.4M8.8 16.4H11.4" /></g></Base>;
export const IconAuto = (p: IconProps) => <Base {...p}><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.6 16.5H4.5C4 16.5 3.5 16 3.5 15.5V12.6L5.8 8C6.1 7.4 6.7 7 7.4 7H16.6C17.3 7 17.9 7.4 18.2 8L20.5 12.6V15.5C20.5 16 20 16.5 19.5 16.5H19.4" /><path d="M9.4 16.5H14.6" /><path d="M4 12.6H20" /><circle cx="7" cy="17" r="2.2" /><circle cx="17" cy="17" r="2.2" /></g></Base>;

export const AMACHIA_ICONS = {
  "panier": IconPanier,
  "favoris": IconFavoris,
  "sac": IconSac,
  "promo": IconPromo,
  "carte-cadeau": IconCarteCadeau,
  "accueil": IconAccueil,
  "recherche": IconRecherche,
  "menu": IconMenu,
  "categories": IconCategories,
  "filtres": IconFiltres,
  "fermer": IconFermer,
  "retour": IconRetour,
  "suivant": IconSuivant,
  "chevron-bas": IconChevronBas,
  "chevron-droite": IconChevronDroite,
  "plus": IconPlus,
  "moins": IconMoins,
  "compte": IconCompte,
  "boutique": IconBoutique,
  "tableau-de-bord": IconTableauDeBord,
  "commandes": IconCommandes,
  "notifications": IconNotifications,
  "messages": IconMessages,
  "parametres": IconParametres,
  "deconnexion": IconDeconnexion,
  "livraison": IconLivraison,
  "livreur-moto": IconLivreurMoto,
  "colis": IconColis,
  "localisation": IconLocalisation,
  "horloge": IconHorloge,
  "livraison-24h": IconLivraison24h,
  "retour-produit": IconRetourProduit,
  "portefeuille": IconPortefeuille,
  "mobile-money": IconMobileMoney,
  "especes": IconEspeces,
  "carte-bancaire": IconCarteBancaire,
  "paiement-securise": IconPaiementSecurise,
  "paiement-livraison": IconPaiementLivraison,
  "etoile": IconEtoile,
  "verifie": IconVerifie,
  "service-client": IconServiceClient,
  "discussion": IconDiscussion,
  "telephone": IconTelephone,
  "partager": IconPartager,
  "info": IconInfo,
  "aide": IconAide,
  "telephones": IconTelephones,
  "mode": IconMode,
  "maison": IconMaison,
  "beaute": IconBeaute,
  "alimentation": IconAlimentation,
  "electronique": IconElectronique,
  "chevron-haut": IconChevronHaut,
  "chevron-gauche": IconChevronGauche,
  "vue-liste": IconVueListe,
  "trier": IconTrier,
  "rafraichir": IconRafraichir,
  "langue": IconLangue,
  "pourcentage": IconPourcentage,
  "points-fidelite": IconPointsFidelite,
  "carte": IconCarte,
  "calendrier": IconCalendrier,
  "modifier": IconModifier,
  "supprimer": IconSupprimer,
  "ajouter-produit": IconAjouterProduit,
  "image": IconImage,
  "appareil-photo": IconAppareilPhoto,
  "importer": IconImporter,
  "telecharger": IconTelecharger,
  "statistiques": IconStatistiques,
  "stock": IconStock,
  "voir": IconVoir,
  "masquer": IconMasquer,
  "cadenas": IconCadenas,
  "email": IconEmail,
  "lien": IconLien,
  "copier": IconCopier,
  "valide": IconValide,
  "alerte": IconAlerte,
  "informatique": IconInformatique,
  "electromenager": IconElectromenager,
  "mode-femme": IconModeFemme,
  "chaussures": IconChaussures,
  "montres": IconMontres,
  "bijoux": IconBijoux,
  "sante": IconSante,
  "boissons": IconBoissons,
  "cuisine": IconCuisine,
  "jardin": IconJardin,
  "bricolage": IconBricolage,
  "jouets": IconJouets,
  "livres": IconLivres,
  "jeux-video": IconJeuxVideo,
  "animaux": IconAnimaux,
  "agriculture": IconAgriculture,
  "audio": IconAudio,
  "sport": IconSport,
  "bebe": IconBebe,
  "auto": IconAuto,
} as const;
export type AmachiaIconName = keyof typeof AMACHIA_ICONS;
