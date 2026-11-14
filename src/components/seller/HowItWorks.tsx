const steps = [
  {
    n: "01",
    title: "Créez votre boutique",
    desc: "Inscrivez-vous gratuitement et configurez votre boutique en quelques minutes. Personnalisez votre design et ajoutez vos informations.",
    img: "/images/visual-5505bf88ea46.webp",
  },
  {
    n: "02",
    title: "Ajoutez vos produits",
    desc: "Importez vos produits ou services avec photos, descriptions et prix. Organisez-les par catégories pour faciliter la navigation.",
    img: "/images/visual-ea276a1196db.webp",
  },
  {
    n: "03",
    title: "Recevez et gérez vos commandes",
    desc: "Vos clients passent commande directement sur votre boutique. Recevez des notifications instantanées et gérez les livraisons facilement.",
    img: "/images/visual-605676ddde20.webp",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 md:py-32 bg-card/30">
      <div className="container mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold">
            Comment ça <span className="text-gradient">fonctionne</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground">
            Trois étapes simples pour commencer à vendre en ligne
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((s) => (
            <div key={s.n} className="bg-card border border-border rounded-3xl overflow-hidden hover:border-primary/50 transition group">
              <div className="aspect-[3/2] relative overflow-hidden">
                <img src={s.img} alt={s.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                <div className="absolute top-4 left-4 w-14 h-14 rounded-full bg-gradient-primary text-black grid place-items-center font-extrabold shadow-elegant">
                  {s.n}
                </div>
              </div>
              <div className="p-7">
                <h3 className="text-xl font-bold mb-3">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
