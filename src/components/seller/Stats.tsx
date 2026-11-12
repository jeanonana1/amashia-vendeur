const stats = [
  { v: "10 000+", l: "Vendeurs actifs" },
  { v: "500 000+", l: "Commandes traitées" },
  { v: "15M+", l: "Revenus générés (FCFA)" },
  { v: "98%", l: "Satisfaction client" },
];

export function Stats() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 opacity-20">
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-gold rounded-full blur-3xl" />
      </div>
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Notre impact <span className="text-gradient">en chiffres</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              Rejoignez des milliers de vendeurs africains qui ont choisi Amashia Seller pour développer leur activité et atteindre de nouveaux sommets.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            {stats.map((s) => (
              <div key={s.l} className="bg-card border border-border rounded-2xl p-8 hover:border-primary/50 transition">
                <p className="text-4xl md:text-5xl font-extrabold text-gradient mb-2">{s.v}</p>
                <p className="text-muted-foreground text-sm">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
