// Cameroon regions → cities → quartiers (échantillon réaliste)
// Pour autres pays : on retourne une liste générique vide → input texte libre côté UI

export type RegionsMap = Record<string, Record<string, string[]>>;

export const LOCATIONS: Record<string, RegionsMap> = {
  Cameroun: {
    Centre: {
      Yaoundé: ["Bastos", "Mvog-Mbi", "Mvan", "Nlongkak", "Mokolo", "Essos", "Ngoa-Ekellé", "Tsinga"],
      Mbalmayo: ["Centre-ville", "Abang", "Ekoumdoum"],
      Obala: ["Centre", "Nkolessong"],
    },
    Littoral: {
      Douala: ["Akwa", "Bonapriso", "Bonamoussadi", "Bali", "Deido", "Bonanjo", "Makepe", "Logpom", "PK10", "New Bell"],
      Edéa: ["Centre", "Pongo"],
      Nkongsamba: ["Centre", "Mbouroukou"],
    },
    Ouest: {
      Bafoussam: ["Tamdja", "Tougang", "Famla", "Banengo"],
      Dschang: ["Centre", "Foreké", "Foto"],
      Bandjoun: ["Centre", "Hiala"],
    },
    Nord: {
      Garoua: ["Plateau", "Roumdé Adjia", "Bibemiré", "Marouaré"],
      Guider: ["Centre"],
    },
    "Extrême-Nord": {
      Maroua: ["Domayo", "Doualaré", "Pitoaré", "Founangué"],
      Kousseri: ["Centre"],
      Mokolo: ["Centre"],
    },
    Adamaoua: {
      Ngaoundéré: ["Bamyanga", "Dang", "Bali", "Madagascar"],
      Tibati: ["Centre"],
    },
    Est: {
      Bertoua: ["Mokolo 1", "Mokolo 2", "Bertoua-Ville"],
      Batouri: ["Centre"],
    },
    Sud: {
      Ebolowa: ["Angalé", "Nko'ovos", "Mvolyé"],
      Kribi: ["Centre", "Dombé", "Afan-Mabé"],
    },
    "Nord-Ouest": {
      Bamenda: ["Commercial Avenue", "Up Station", "Nkwen", "Mile 4", "Mankon"],
      Kumbo: ["Tobin", "Squares"],
    },
    "Sud-Ouest": {
      Buéa: ["Molyko", "Bonduma", "Great Soppo", "Mile 16"],
      Limbe: ["Down Beach", "Mile 4", "Bota"],
      Tiko: ["Centre", "Mutengene"],
    },
  },
  Sénégal: {
    Dakar: { Dakar: ["Plateau", "Médina", "Almadies", "Mermoz", "Ouakam"], Pikine: ["Centre"], Rufisque: ["Centre"] },
    Thiès: { Thiès: ["Centre"], Mbour: ["Saly", "Centre"] },
  },
  "Côte d'Ivoire": {
    Abidjan: { Abidjan: ["Cocody", "Plateau", "Yopougon", "Marcory", "Treichville"] },
    Yamoussoukro: { Yamoussoukro: ["Centre"] },
  },
  Bénin: { Littoral: { Cotonou: ["Cadjehoun", "Akpakpa", "Centre"] } },
  Togo: { Maritime: { Lomé: ["Bè", "Tokoin", "Adidogomé"] } },
};

export const getRegions = (country: string) => Object.keys(LOCATIONS[country] ?? {});
export const getCities = (country: string, region: string) =>
  Object.keys(LOCATIONS[country]?.[region] ?? {});
export const getQuartiers = (country: string, region: string, city: string) =>
  LOCATIONS[country]?.[region]?.[city] ?? [];
