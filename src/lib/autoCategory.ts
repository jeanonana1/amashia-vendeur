/**
 * Détection automatique de la sous-catégorie à partir du titre du produit.
 * Chaque règle associe une sous-catégorie (nom exact de la classification Amachia) à des mots-clés
 * (français, anglais, marques courantes au Cameroun). Les expressions longues et précises l'emportent
 * sur les mots courts : « chargeur iPhone » → Accessoires téléphone, « montre connectée » → Objets connectés.
 */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

type Rule = { sub: string; keys: string[]; boost?: number };
const RULES: Rule[] = [
  // ——— Téléphones & Tablettes
  { sub: "Coques & protections écran", boost: 4, keys: ["coque", "etui", "housse telephone", "protection ecran", "verre trempe", "film protecteur", "protege ecran"] },
  { sub: "Chargeurs & câbles", boost: 4, keys: ["chargeur", "charger", "cable usb", "cable type c", "cable lightning", "cable", "adaptateur secteur", "chargeur rapide", "chargeur sans fil"] },
  { sub: "Power banks & batteries", boost: 3, keys: ["power bank", "powerbank", "batterie externe", "pile", "piles", "batterie telephone", "batterie"] },
  { sub: "Accessoires téléphones", boost: 2, keys: ["support telephone", "porte telephone", "perche selfie", "selfie stick", "trepied telephone", "stylet", "carte memoire", "carte sd", "micro sd", "microsd"] },
  { sub: "Tablettes", boost: 2, keys: ["tablette", "tablet", "ipad", "galaxy tab", "tab a", "tablette enfant"] },
  { sub: "Téléphones basiques", boost: 3, keys: ["telephone basique", "telephone a touches", "feature phone", "nokia 105", "nokia 106", "itel it", "telephone simple", "telephone clapet"] },
  { sub: "Smartphones", keys: ["telephone", "smartphone", "iphone", "galaxy s", "galaxy a", "galaxy z", "galaxy note", "samsung galaxy", "tecno", "camon", "spark", "infinix", "hot 40", "itel", "redmi", "xiaomi", "huawei", "oppo", "vivo", "realme", "nokia", "pixel", "android", "portable 4g", "telephone portable"] },
  { sub: "Montres & objets connectés", boost: 3, keys: ["montre connectee", "smartwatch", "smart watch", "bracelet connecte", "apple watch", "galaxy watch", "mi band", "smart band", "ampoule connectee", "prise connectee"] },
  // ——— TV & Électronique
  { sub: "Téléviseurs & Home cinéma", keys: ["tv", "tele", "televiseur", "television", "smart tv", "android tv", "home cinema", "barre de son", "soundbar", "telecommande", "support tv"] },
  { sub: "Vidéoprojecteurs", boost: 3, keys: ["videoprojecteur", "projecteur video", "video projecteur", "ecran de projection"] },
  { sub: "Décodeurs & antennes", boost: 3, keys: ["decodeur", "antenne", "parabole", "canal+", "startimes", "tnt"] },
  { sub: "Casques & écouteurs", boost: 1, keys: ["ecouteur", "ecouteurs", "earbuds", "earphone", "airpods", "freepods", "buds", "casque audio", "casque bluetooth", "headphone", "headphones", "headset", "kit main libre"] },
  { sub: "Enceintes Bluetooth", boost: 1, keys: ["enceinte", "haut parleur", "speaker", "jbl", "baffle", "enceinte bluetooth"] },
  { sub: "Audio & Hi-Fi", keys: ["ampli", "amplificateur", "microphone", "micro", "chaine hifi", "radio", "platine", "table de mixage"] },
  { sub: "Photo & Caméscopes", keys: ["appareil photo", "camera", "camescope", "objectif", "gopro", "trepied", "tripod", "ring light", "anneau lumineux", "flash photo", "canon eos", "nikon", "camera de surveillance"] },
  { sub: "Drones", boost: 2, keys: ["drone", "dji"] },
  // ——— Informatique
  { sub: "Ordinateurs portables", boost: 1, keys: ["ordinateur portable", "laptop", "pc portable", "macbook", "notebook", "chromebook", "hp elitebook", "thinkpad", "ordinateur"] },
  { sub: "Ordinateurs de bureau", boost: 2, keys: ["pc bureau", "ordinateur de bureau", "unite centrale", "imac", "desktop", "tout en un"] },
  { sub: "Imprimantes & scanners", boost: 2, keys: ["imprimante", "printer", "scanner", "cartouche", "toner", "photocopieuse"] },
  { sub: "Disques durs & clés USB", boost: 2, keys: ["cle usb", "flash disk", "disque dur", "hard drive", "ssd", "disque externe"] },
  { sub: "Réseau & Wi-Fi", boost: 2, keys: ["routeur", "router", "modem", "wifi", "repeteur", "switch reseau", "cable ethernet", "mifi"] },
  { sub: "Onduleurs & protection électrique", boost: 2, keys: ["onduleur", "ups", "stabilisateur", "regulateur de tension", "parafoudre"] },
  { sub: "Logiciels", boost: 2, keys: ["logiciel", "antivirus", "windows 11", "microsoft office", "licence"] },
  { sub: "Claviers, souris & accessoires", keys: ["clavier", "souris", "mouse", "keyboard", "ecran pc", "moniteur", "monitor", "webcam", "tapis de souris", "hub usb", "sacoche ordinateur", "dell", "lenovo", "asus", "acer"] },
  // ——— Jeux vidéo
  { sub: "Manettes & accessoires gaming", boost: 3, keys: ["manette", "gamepad", "volant gaming", "casque gaming", "souris gaming"] },
  { sub: "Consoles", keys: ["playstation", "ps4", "ps5", "xbox", "nintendo", "switch", "console"] },
  { sub: "Jeux", boost: 1, keys: ["jeu video", "jeux video", "fifa", "ea fc", "jeu ps5", "jeu ps4"] },
  // ——— Mode
  { sub: "Chaussures Femme", boost: 2, keys: ["escarpin", "talon", "talons", "ballerine", "sandale femme", "chaussure femme", "basket femme", "mule femme"] },
  { sub: "Chaussures Homme", keys: ["chaussure homme", "basket homme", "mocassin", "derby", "richelieu", "sandale homme", "chaussure", "chaussures", "basket", "baskets", "sneakers", "sneaker", "sandale", "sandales", "tong", "babouche", "botte", "bottes", "nike", "adidas", "puma", "crocs"] },
  { sub: "Lingerie & sous-vêtements", boost: 3, keys: ["soutien gorge", "lingerie", "brassiere", "culotte", "slip", "boxer", "caleçon", "nuisette", "chaussettes"] },
  { sub: "Vêtements Femme", boost: 2, keys: ["robe", "jupe", "legging", "blouse", "kaba", "vetement femme", "t shirt femme", "pantalon femme", "ensemble femme", "body femme"] },
  { sub: "Mode africaine & pagne", boost: 3, keys: ["pagne", "wax", "kaba ngondo", "boubou", "dashiki", "bazin", "tissu africain"] },
  { sub: "Vêtements Homme", keys: ["costume", "chemise homme", "t shirt homme", "pantalon homme", "vetement homme", "polo homme", "jean homme", "ensemble homme", "cravate", "t shirt", "tee shirt", "tshirt", "chemise", "pantalon", "jean", "short", "veste", "blouson", "manteau", "pull", "sweat", "hoodie", "polo", "survetement", "pyjama", "casquette", "chapeau", "ceinture", "echarpe"] },
  { sub: "Mode Enfant", boost: 2, keys: ["enfant", "enfants", "fille", "garcon", "vetement enfant", "uniforme scolaire"] },
  { sub: "Sacs & Bagages", keys: ["sac", "sac a main", "sac a dos", "backpack", "valise", "bagage", "sacoche", "portefeuille", "wallet", "pochette", "cartable", "trousse"] },
  { sub: "Montres", keys: ["montre", "watch", "rolex", "casio", "chronographe"] },
  { sub: "Bijoux", keys: ["collier", "bague", "bracelet", "boucle d oreille", "boucles d oreilles", "chaine", "chainette", "pendentif", "gourmette", "parure", "bijou", "bijoux", "perles"] },
  { sub: "Lunettes de soleil", boost: 2, keys: ["lunettes de soleil", "lunettes", "lunette", "sunglasses", "ray ban"] },
  // ——— Bébé & Jouets
  { sub: "Couches & lingettes", boost: 3, keys: ["couche", "couches", "pampers", "lingette", "lingettes", "molfix"] },
  { sub: "Alimentation bébé", boost: 3, keys: ["lait infantile", "lait bebe", "cerelac", "bledina", "petit pot", "nan 1", "guigoz"] },
  { sub: "Puériculture", boost: 2, keys: ["poussette", "biberon", "tetine", "landau", "berceau", "porte bebe", "siege auto bebe", "chaise haute", "baignoire bebe", "bebe", "baby"] },
  { sub: "Vêtements bébé", boost: 3, keys: ["body bebe", "grenouillere", "vetement bebe", "pyjama bebe", "bonnet bebe"] },
  { sub: "Jouets & jeux", boost: 2, keys: ["jouet", "jouets", "doudou", "peluche", "poupee", "lego", "puzzle", "jeu de societe", "voiture telecommandee"] },
  // ——— Électroménager
  { sub: "Réfrigérateurs & congélateurs", boost: 2, keys: ["refrigerateur", "frigo", "congelateur", "refrigerateur congelateur", "frigo bar"] },
  { sub: "Cuisinières & fours", boost: 2, keys: ["cuisiniere", "four", "plaque de cuisson", "gaziniere", "rechaud", "gas cooker", "cooker", "four electrique"] },
  { sub: "Machines à laver", boost: 2, keys: ["machine a laver", "lave linge", "seche linge", "lave vaisselle"] },
  { sub: "Climatiseurs", boost: 2, keys: ["climatiseur", "climatisation", "split", "clim"] },
  { sub: "Ventilateurs", boost: 2, keys: ["ventilateur", "brasseur d air", "ventilo"] },
  { sub: "Fontaines à eau", boost: 3, keys: ["fontaine a eau", "distributeur d eau", "water dispenser", "dispenser"] },
  { sub: "Fers à repasser", boost: 3, keys: ["fer a repasser", "defroisseur", "centrale vapeur"] },
  { sub: "Petit électroménager", boost: 1, keys: ["blender", "mixeur", "mixer", "bouilloire", "micro onde", "micro ondes", "grille pain", "friteuse", "airfryer", "air fryer", "cafetiere", "machine a cafe", "robot cuisine", "rice cooker", "cuiseur", "aspirateur", "chauffe eau"] },
  // ——— Maison & Cuisine
  { sub: "Meubles", keys: ["canape", "fauteuil", "chaise", "table", "lit", "armoire", "commode", "bureau en bois", "meuble", "etagere murale", "buffet", "salon complet", "tabouret"] },
  { sub: "Décoration", keys: ["tableau", "vase", "tapis", "miroir", "cadre photo", "decoration", "deco", "fleur artificielle", "bougie", "horloge murale", "sticker mural"] },
  { sub: "Literie", boost: 1, keys: ["matelas", "oreiller", "couverture", "moustiquaire", "traversin", "sommier"] },
  { sub: "Ustensiles de cuisine", keys: ["casserole", "poele", "marmite", "cocotte", "couteau", "spatule", "louche", "ustensile", "ustensiles", "planche a decouper", "rape", "passoire", "fouet", "moule a gateau"] },
  { sub: "Vaisselle", keys: ["assiette", "assiettes", "verre", "verres", "tasse", "tasses", "bol", "bols", "couverts", "fourchette", "cuillere", "plateau", "service a the", "carafe", "mug", "gobelet"] },
  { sub: "Rangement & organisation", keys: ["boite de rangement", "rangement", "etagere", "panier", "organisateur", "range chaussures", "porte manteau", "cintre", "caisse"] },
  { sub: "Linge de maison", keys: ["drap", "draps", "drap housse", "parure de lit", "housse de couette", "couette", "taie", "taie d oreiller", "rideau", "rideaux", "serviette de bain", "serviette", "nappe", "torchon", "tablier", "housse de canape", "coussin"] },
  { sub: "Éclairage", keys: ["lampe", "ampoule", "led", "lustre", "torche", "lampe torche", "projecteur", "spot", "veilleuse", "guirlande"] },
  { sub: "Salle de bain", keys: ["pommeau de douche", "pommeau", "robinet", "porte serviette", "tapis de bain", "rideau de douche", "lavabo", "wc", "toilette"] },
  // ——— Beauté & Santé
  { sub: "Maquillage", keys: ["rouge a levres", "lipstick", "gloss", "fond de teint", "foundation", "mascara", "eyeliner", "crayon yeux", "palette", "fard", "blush", "poudre", "correcteur", "maquillage", "makeup", "make up"] },
  { sub: "Soins du visage", boost: 1, keys: ["creme visage", "serum", "nettoyant visage", "masque visage", "anti acne", "anti tache", "eclaircissant", "contour des yeux", "tonique", "gommage visage", "soin visage"] },
  { sub: "Soins du corps", keys: ["lait corporel", "lotion", "beurre de karite", "karite", "gel douche", "savon", "creme corps", "huile corporelle", "gommage corps", "vaseline", "body lotion", "body wash", "shower gel", "body cream", "lait de toilette"] },
  { sub: "Parfums", keys: ["parfum", "eau de toilette", "eau de parfum", "deodorant", "deo", "brume", "fragrance", "musc"] },
  { sub: "Soins des cheveux", keys: ["perruque", "wig", "meche", "meches", "tissage", "shampoing", "shampooing", "apres shampoing", "defrisant", "extension", "lace", "frontal", "closure", "tresse", "huile capillaire", "creme capillaire", "peigne", "brosse a cheveux"] },
  { sub: "Rasage & épilation", boost: 2, keys: ["rasoir", "mousse a raser", "tondeuse", "tondeuse cheveux", "rasoir electrique", "epilateur", "cire epilation", "seche cheveux"] },
  { sub: "Hygiène", keys: ["dentifrice", "brosse a dents", "serviette hygienique", "protege slip", "gel hydroalcoolique", "desinfectant", "coton tige"] },
  { sub: "Ongles & manucure", keys: ["vernis", "ongles", "faux ongles", "lime a ongles", "manucure", "pedicure", "gel uv"] },
  { sub: "Santé & bien-être", keys: ["complement alimentaire", "vitamine", "vitamines", "tisane", "massage", "huile essentielle", "minceur", "detox", "masseur", "tensiometre", "thermometre", "glucometre"] },
  // ——— Supermarché
  { sub: "Boissons", boost: 1, keys: ["boisson", "jus", "eau minerale", "soda", "biere", "vin", "whisky", "energy drink"] },
  { sub: "Produits ménagers", boost: 2, keys: ["detergent", "lessive", "javel", "eau de javel", "liquide vaisselle", "nettoyant", "insecticide", "desodorisant", "serpilliere", "balai"] },
  { sub: "Épicerie", keys: ["riz", "huile", "farine", "cafe", "sucre", "sel", "epice", "epices", "miel", "chocolat", "biscuit", "lait en poudre", "conserve", "pates", "spaghetti", "the", "condiment", "arachide", "ndole", "poisson"] },
  // ——— Sport
  { sub: "Football & sports collectifs", boost: 2, keys: ["ballon", "maillot", "crampons", "protege tibia", "filet", "basketball", "volley"] },
  { sub: "Vélos & trottinettes", boost: 2, keys: ["velo", "trottinette", "vtt", "bicyclette", "skateboard", "roller"] },
  { sub: "Vêtements de sport", boost: 2, keys: ["survetement sport", "legging sport", "brassiere sport", "jogging", "short de sport"] },
  { sub: "Camping & plein air", boost: 2, keys: ["tente", "camping", "sac de couchage", "glaciere", "randonnee"] },
  { sub: "Fitness & musculation", keys: ["haltere", "halteres", "tapis de yoga", "yoga", "fitness", "musculation", "corde a sauter", "raquette", "gourde", "banc de musculation", "sport"] },
  // ——— Auto & Moto
  { sub: "Pièces auto", boost: 2, keys: ["pneu", "pneus", "batterie voiture", "jante", "plaquette de frein", "filtre a huile", "amortisseur", "retroviseur"] },
  { sub: "Huiles & entretien", boost: 2, keys: ["huile moteur", "liquide de refroidissement", "lave glace", "cire voiture", "shampoing voiture"] },
  { sub: "Électronique auto", boost: 2, keys: ["autoradio", "dashcam", "camera de recul", "gps voiture", "chargeur voiture", "allume cigare"] },
  { sub: "Motos & accessoires moto", boost: 2, keys: ["moto", "casque moto", "scooter", "gants moto"] },
  { sub: "Accessoires auto", keys: ["voiture", "auto", "housse siege", "tapis voiture", "car", "desodorisant voiture"] },
  // ——— Jardin & Bricolage
  { sub: "Outillage", boost: 1, keys: ["perceuse", "visseuse", "marteau", "tournevis", "cle a molette", "scie", "meuleuse", "boite a outils", "pince"] },
  { sub: "Quincaillerie & électricité", boost: 1, keys: ["cable electrique", "prise", "multiprise", "interrupteur", "disjoncteur", "groupe electrogene", "generateur", "panneau solaire", "cadenas", "serrure", "vis", "clou"] },
  { sub: "Jardin & Extérieur", keys: ["jardin", "tondeuse a gazon", "arrosoir", "tuyau d arrosage", "barbecue", "parasol", "salon de jardin", "pot de fleur", "lampe solaire"] },
  { sub: "Agriculture & Élevage", keys: ["semence", "semences", "engrais", "poussin", "poussins", "aliment betail", "provende", "pesticide", "herbicide", "pulverisateur", "machette", "houe", "elevage", "agricole"] },
  { sub: "Animalerie", boost: 2, keys: ["chien", "chat", "croquettes", "litiere", "aquarium", "collier chien", "animal"] },
  // ——— Livres & Papeterie
  { sub: "Livres", boost: 1, keys: ["livre", "roman", "manuel", "bible", "coran", "dictionnaire", "bande dessinee"] },
  { sub: "Fournitures scolaires", boost: 1, keys: ["cahier", "stylo", "crayon", "regle", "calculatrice", "kit scolaire", "sac d ecole"] },
  { sub: "Fournitures de bureau", boost: 1, keys: ["ramette", "papier a4", "classeur", "agrafeuse", "chemise cartonnee", "post it", "enveloppe"] },
];

export type CategoryGuess = { sub: string; score: number };

/** Meilleure sous-catégorie pour ce titre, parmi celles qui existent (`allowed`). */
const STOP = new Set(["pour", "avec", "sans", "autres", "autre", "accessoires", "produits", "articles", "divers", "homme", "femme", "enfant", "enfants", "maison"]);

export function detectSubcategory(title: string, allowed: string[]): CategoryGuess | null {
  const t = ` ${norm(title)} `;
  if (t.trim().length < 3) return null;
  const ok = new Set(allowed);
  let best: CategoryGuess | null = null;
  for (const r of RULES) {
    if (!ok.has(r.sub)) continue;
    let score = 0;
    for (const k of r.keys) {
      const key = norm(k);
      // mot entier (ou expression entière), avec pluriel simple
      if (t.includes(` ${key} `) || t.includes(` ${key}s `)) score = Math.max(score, key.length + (key.includes(" ") ? 6 : 0));
    }
    if (!score) continue;
    score += r.boost ?? 0;
    if (!best || score > best.score) best = { sub: r.sub, score };
  }
  // Repli : les mots du nom même de la sous-catégorie (telle qu'elle existe dans la base)
  if (!best) {
    for (const sub of allowed) {
      for (const w of norm(sub).split(/[^a-z0-9]+/)) {
        if (w.length < 4 || STOP.has(w)) continue;
        const stem = w.endsWith("s") || w.endsWith("x") ? w.slice(0, -1) : w;
        if (t.includes(` ${w} `) || t.includes(` ${stem} `) || t.includes(` ${stem}s `)) {
          const score = w.length;
          if (!best || score > best.score) best = { sub, score };
        }
      }
    }
  }
  // « homme » / « femme » dans le titre : on préfère la variante genrée quand elle existe dans la base
  if (best) {
    const g = / homme| hommes| garcon/.test(t) ? "Homme" : / femme| femmes| fille| dame/.test(t) ? "Femme" : null;
    const base = best.sub.replace(/ (Homme|Femme)$/, "");
    const gendered = g ? allowed.find((a) => norm(a) === norm(`${base} ${g}`)) : undefined;
    if (gendered) best = { sub: gendered, score: best.score };
  }
  return best;
}
