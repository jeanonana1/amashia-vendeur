/**
 * Logo officiel « amashia seller ».
 * Mode clair : texte « amashia » noir ; mode sombre : texte « amashia » blanc (même pouce et « seller » orange).
 */
export function SellerLogo({ className = "h-9" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`}>
      <img src="/logo-amashia-seller.png" alt="amashia seller" width={1200} height={306} className="h-full w-auto dark:hidden" />
      <img src="/logo-amashia-seller-dark.png" alt="amashia seller" width={1200} height={306} className="hidden h-full w-auto dark:block" />
    </span>
  );
}
