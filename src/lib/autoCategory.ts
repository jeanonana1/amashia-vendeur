/**
 * Détection automatique de la sous-catégorie à partir du titre du produit.
 * Chaque règle associe une sous-catégorie (nom exact de la classification Amashia) à des mots-clés
 * (français, anglais, marques courantes au Cameroun). Les expressions longues et précises l'emportent
 * sur les mots courts : « chargeur iPhone » → Accessoires téléphone, « montre connectée » → Objets connectés.
 */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

type Rule = { sub: string; keys: string[]; boost?: number };
const RULES: Rule[] = [
  // ——— Électronique
  { sub: "Accessoires téléphone", boost: 3, keys: ["chargeur", "charger", "cable usb", "cable type c", "cable lightning", "cable", "coque", "etui", "housse telephone", "protection ecran", "verre trempe", "film protecteur", "support telephone", "porte telephone", "adaptateur secteur", "perche selfie", "selfie stick"] },
  { sub: "Stockage & Batteries", boost: 2, keys: ["power bank", "powerbank", "batterie externe", "cle usb", "flash disk", "disque dur", "hard drive", "carte memoire", "carte sd", "micro sd", "microsd", "ssd", "pile", "piles", "batterie"] },
  { sub: "Téléphones & Tablettes", keys: ["telephone", "smartphone", "iphone", "galaxy s", "galaxy a", "galaxy z", "galaxy note", "samsung galaxy", "tecno", "camon", "spark", "infinix", "hot 40", "itel", "redmi", "xiaomi", "huawei", "oppo", "vivo", "realme", "nokia", "pixel", "tablette", "tablet", "ipad", "galaxy tab", "android", "portable 4g", "telephone portable"] },
  { sub: "Ordinateurs & Accessoires", keys: ["ordinateur", "laptop", "pc portable", "pc bureau", "macbook", "imac", "notebook", "chromebook", "hp elitebook", "thinkpad", "dell", "lenovo", "asus", "acer", "clavier", "souris", "mouse", "keyboard", "ecran pc", "moniteur", "monitor", "imprimante", "printer", "webcam", "routeur", "router", "modem", "onduleur", "tapis de souris", "cartouche"] },
  { sub: "TV & Home Cinéma", keys: ["tv", "tele", "televiseur", "television", "smart tv", "android tv", "home cinema", "barre de son", "soundbar", "videoprojecteur", "projecteur video", "decodeur", "antenne", "telecommande", "support tv"] },
  { sub: "Audio & Hi-Fi", keys: ["ecouteur", "ecouteurs", "earbuds", "earphone", "airpods", "freepods", "buds", "casque audio", "casque bluetooth", "headphone", "headset", "enceinte", "haut parleur", "speaker", "jbl", "baffle", "ampli", "amplificateur", "microphone", "micro"] },
  { sub: "Photo & Caméscopes", keys: ["appareil photo", "camera", "camescope", "objectif", "gopro", "trepied", "tripod", "ring light", "anneau lumineux", "flash photo", "canon eos", "nikon", "camera de surveillance"] },
  { sub: "Jeux vidéo & Consoles", keys: ["playstation", "ps4", "ps5", "xbox", "nintendo", "switch", "manette", "console", "jeu video", "jeux video", "fifa", "gamepad"] },
  { sub: "Drones", boost: 2, keys: ["drone", "dji"] },
  { sub: "Objets connectés", boost: 3, keys: ["montre connectee", "smartwatch", "smart watch", "bracelet connecte", "apple watch", "galaxy watch", "mi band", "smart band", "ampoule connectee", "prise connectee"] },
  // ——— Mode
  { sub: "Chaussures Femme", boost: 2, keys: ["escarpin", "talon", "talons", "ballerine", "sandale femme", "chaussure femme", "basket femme", "mule femme"] },
  { sub: "Chaussures Homme", boost: 2, keys: ["chaussure homme", "basket homme", "mocassin", "derby", "richelieu", "sandale homme"] },
  { sub: "Chaussures", keys: ["chaussure", "chaussures", "basket", "baskets", "sneakers", "sneaker", "sandale", "sandales", "tong", "babouche", "botte", "bottes", "nike", "adidas", "puma", "crocs"] },
  { sub: "Vêtements Femme", boost: 2, keys: ["robe", "jupe", "legging", "soutien gorge", "lingerie", "brassiere", "blouse", "kaba", "vetement femme", "t shirt femme", "pantalon femme", "ensemble femme", "body femme"] },
  { sub: "Vêtements Homme", boost: 2, keys: ["costume", "chemise homme", "t shirt homme", "pantalon homme", "vetement homme", "boubou homme", "polo homme", "jean homme", "ensemble homme", "cravate"] },
  { sub: "Mode", keys: ["t shirt", "tee shirt", "tshirt", "chemise", "pantalon", "jean", "short", "veste", "blouson", "manteau", "pull", "sweat", "hoodie", "polo", "pagne", "wax", "survetement", "pyjama", "casquette", "chapeau", "ceinture", "echarpe"] },
  { sub: "Sacs & Bagages", keys: ["sac", "sac a main", "sac a dos", "backpack", "valise", "bagage", "sacoche", "portefeuille", "wallet", "pochette", "cartable", "trousse"] },
  { sub: "Montres", keys: ["montre", "watch", "rolex", "casio", "chronographe"] },
  { sub: "Bijoux", keys: ["collier", "bague", "bracelet", "boucle d oreille", "boucles d oreilles", "chaine", "chainette", "pendentif", "gourmette", "parure", "bijou", "bijoux", "perles"] },
  { sub: "Lunettes de soleil", boost: 2, keys: ["lunettes de soleil", "lunettes", "lunette", "sunglasses", "ray ban"] },
  { sub: "Bébé & Enfants", boost: 1, keys: ["bebe", "enfant", "enfants", "fille", "garcon", "couche", "couches", "pampers", "poussette", "biberon", "tetine", "jouet", "jouets", "doudou", "landau", "berceau", "baby"] },
  // ——— Maison & Jardin
  { sub: "Électroménager", keys: ["refrigerateur", "frigo", "congelateur", "machine a laver", "lave linge", "lave vaisselle", "climatiseur", "climatisation", "cuisiniere", "four", "plaque de cuisson", "ventilateur", "chauffe eau", "groupe electrogene", "generateur"] },
  { sub: "Petit électroménager", boost: 1, keys: ["blender", "mixeur", "mixer", "bouilloire", "fer a repasser", "micro onde", "micro ondes", "grille pain", "friteuse", "airfryer", "air fryer", "cafetiere", "machine a cafe", "robot cuisine", "rice cooker", "cuiseur", "seche cheveux", "tondeuse cheveux", "rasoir electrique", "aspirateur"] },
  { sub: "Meubles", keys: ["canape", "fauteuil", "chaise", "table", "lit", "armoire", "commode", "bureau en bois", "meuble", "etagere murale", "buffet", "salon complet", "tabouret"] },
  { sub: "Décoration", keys: ["tableau", "vase", "rideau", "rideaux", "tapis", "miroir", "cadre photo", "decoration", "deco", "fleur artificielle", "bougie", "horloge murale", "sticker mural"] },
  { sub: "Literie", boost: 1, keys: ["matelas", "oreiller", "drap", "draps", "couette", "couverture", "housse de couette", "moustiquaire", "traversin"] },
  { sub: "Jardin & Extérieur", keys: ["jardin", "tondeuse a gazon", "arrosoir", "tuyau d arrosage", "barbecue", "parasol", "salon de jardin", "pot de fleur", "lampe solaire"] },
  { sub: "Alimentation", keys: ["riz", "huile", "farine", "cafe", "sucre", "sel", "epice", "epices", "boisson", "jus", "eau minerale", "miel", "chocolat", "biscuit", "lait en poudre", "conserve", "pates", "spaghetti", "the", "condiment", "arachide", "ndole", "poisson"] },
  { sub: "Sport & Loisirs", keys: ["ballon", "maillot", "haltere", "halteres", "velo", "tapis de yoga", "yoga", "fitness", "musculation", "corde a sauter", "raquette", "crampons", "survetement sport", "gourde", "trottinette", "sport"] },
  { sub: "Automobile & Moto", keys: ["voiture", "auto", "moto", "pneu", "pneus", "casque moto", "huile moteur", "batterie voiture", "autoradio", "housse siege", "retroviseur", "jante", "car"] },
  { sub: "Agriculture & Élevage", keys: ["semence", "semences", "engrais", "poussin", "poussins", "aliment betail", "provende", "pesticide", "herbicide", "pulverisateur", "machette", "houe", "elevage", "agricole"] },
  { sub: "Services", keys: ["service", "reparation", "cours", "formation", "location", "installation", "maintenance", "depannage", "livraison express", "coiffure a domicile"] },
  // ——— Beauté & Soins
  { sub: "Maquillage", keys: ["rouge a levres", "lipstick", "gloss", "fond de teint", "foundation", "mascara", "eyeliner", "crayon yeux", "palette", "fard", "blush", "poudre", "correcteur", "maquillage", "makeup", "make up"] },
  { sub: "Soins du visage", boost: 1, keys: ["creme visage", "serum", "nettoyant visage", "masque visage", "anti acne", "anti tache", "eclaircissant", "contour des yeux", "tonique", "gommage visage", "soin visage"] },
  { sub: "Soins du corps", keys: ["lait corporel", "lotion", "beurre de karite", "karite", "gel douche", "savon", "creme corps", "huile corporelle", "gommage corps", "vaseline", "body lotion", "body wash", "shower gel", "body cream", "lait de toilette"] },
  { sub: "Parfums", keys: ["parfum", "eau de toilette", "eau de parfum", "deodorant", "deo", "brume", "fragrance", "musc"] },
  { sub: "Cheveux", keys: ["perruque", "wig", "meche", "meches", "tissage", "shampoing", "shampooing", "apres shampoing", "defrisant", "extension", "lace", "frontal", "closure", "tresse", "huile capillaire", "creme capillaire", "peigne", "brosse a cheveux"] },
  { sub: "Hygiène", keys: ["dentifrice", "brosse a dents", "serviette hygienique", "protege slip", "gel hydroalcoolique", "desinfectant", "coton tige", "rasoir", "mousse a raser"] },
  { sub: "Manucure", keys: ["vernis", "ongles", "faux ongles", "lime a ongles", "manucure", "pedicure", "gel uv"] },
  { sub: "Bien-être", keys: ["complement alimentaire", "vitamine", "vitamines", "tisane", "massage", "huile essentielle", "minceur", "detox", "masseur"] },
  // ——— Cuisine & Maison
  { sub: "Ustensiles de cuisine", keys: ["casserole", "poele", "marmite", "cocotte", "couteau", "spatule", "louche", "ustensile", "ustensiles", "planche a decouper", "rape", "passoire", "fouet", "moule a gateau"] },
  { sub: "Vaisselle", keys: ["assiette", "assiettes", "verre", "verres", "tasse", "tasses", "bol", "bols", "couverts", "fourchette", "cuillere", "plateau", "service a the", "carafe", "mug", "gobelet"] },
  { sub: "Rangement", keys: ["boite de rangement", "rangement", "etagere", "panier", "organisateur", "range chaussures", "porte manteau", "cintre", "caisse"] },
  { sub: "Linge de maison", keys: ["drap", "draps", "drap housse", "parure de lit", "housse de couette", "couette", "taie", "taie d oreiller", "rideau", "rideaux", "serviette de bain", "serviette", "nappe", "torchon", "tablier", "housse de canape", "coussin"] },
  { sub: "Éclairage", keys: ["lampe", "ampoule", "led", "lustre", "torche", "lampe torche", "projecteur", "spot", "veilleuse", "guirlande"] },
  { sub: "Salle de bain", keys: ["pommeau de douche", "pommeau", "robinet", "porte serviette", "tapis de bain", "rideau de douche", "lavabo", "wc", "toilette"] },
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
    const gendered = g ? allowed.find((a) => norm(a) === norm(`${best!.sub} ${g}`)) : undefined;
    if (gendered) best = { sub: gendered, score: best.score };
  }
  return best;
}
