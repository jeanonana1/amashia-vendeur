/**
 * Logo officiel « amachia seller ».
 * Mode clair : texte « amachia » noir ; mode sombre : texte « amachia » blanc (même pouce et « seller » orange).
 */
export function SellerLogo({ className = "h-6" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <img src="/logo-amachia-seller.png" alt="amachia seller" width={1195} height={155} className="h-full w-auto dark:hidden" />
      <img src="/logo-amachia-seller-dark.png" alt="amachia seller" width={1195} height={155} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
