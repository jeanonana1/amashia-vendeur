-- Arborescence des catégories et sous-catégories Amachia (inspirée du menu de Jumia, adaptée au Cameroun).
-- Les noms de sous-catégories sont uniques : le formulaire produit du site vendeur s'en sert pour classer le produit.
-- Les commissions existantes ne sont pas modifiées (nouvelles catégories : valeur par défaut, à régler dans l'admin).
begin;

create temp table t_cat (sort int, slug text, name text, description text) on commit drop;
insert into t_cat values
 (1,  'telephones',   'Téléphones & Tablettes', 'Smartphones, téléphones basiques, tablettes et tous les accessoires pour votre téléphone.'),
 (2,  'electronics',  'TV & Électronique',      'Téléviseurs, son, casques, photo, drones et vidéoprojecteurs.'),
 (3,  'informatique', 'Informatique',           'Ordinateurs portables et de bureau, imprimantes, stockage, réseau et accessoires.'),
 (4,  'electromenager','Électroménager',        'Réfrigérateurs, cuisinières, machines à laver, climatiseurs, ventilateurs et petit électroménager.'),
 (5,  'kitchen-home', 'Maison & Cuisine',       'Ustensiles, vaisselle, literie, meubles, décoration, éclairage et salle de bain.'),
 (6,  'fashion',      'Mode',                   'Vêtements, chaussures, sacs, montres et bijoux pour femme, homme et enfant.'),
 (7,  'beauty',       'Beauté & Santé',         'Maquillage, soins du visage, du corps et des cheveux, parfums, hygiène et bien-être.'),
 (8,  'bebe-jouets',  'Bébé & Jouets',          'Couches, alimentation bébé, puériculture, vêtements bébé, jouets et jeux.'),
 (9,  'supermarche',  'Supermarché',            'Épicerie, boissons et produits ménagers.'),
 (10, 'sport',        'Sport & Fitness',        'Fitness, sports collectifs, vêtements de sport, vélos et plein air.'),
 (11, 'jeux-video',   'Jeux vidéo',             'Consoles, jeux et accessoires gaming.'),
 (12, 'auto-moto',    'Auto & Moto',            'Accessoires, pièces, entretien, électronique auto et motos.'),
 (13, 'home-garden',  'Jardin & Bricolage',     'Outillage, quincaillerie, jardin, agriculture, élevage et animalerie.'),
 (14, 'livres-papeterie','Livres & Papeterie',  'Livres, fournitures scolaires et fournitures de bureau.');

create temp table t_sub (cat text, sort int, slug text, name text) on commit drop;
insert into t_sub values
 ('telephones',1,'smartphones','Smartphones'),
 ('telephones',2,'telephones-basiques','Téléphones basiques'),
 ('telephones',3,'tablettes','Tablettes'),
 ('telephones',4,'coques-protections','Coques & protections écran'),
 ('telephones',5,'chargeurs-cables','Chargeurs & câbles'),
 ('telephones',6,'stockage-batteries','Power banks & batteries'),
 ('telephones',7,'objets-connectes','Montres & objets connectés'),
 ('telephones',8,'accessoires-telephone','Accessoires téléphones'),

 ('electronics',1,'tv-home-cinema','Téléviseurs & Home cinéma'),
 ('electronics',2,'audio-hi-fi','Audio & Hi-Fi'),
 ('electronics',3,'casques-ecouteurs','Casques & écouteurs'),
 ('electronics',4,'enceintes','Enceintes Bluetooth'),
 ('electronics',5,'photo-camescopes','Photo & Caméscopes'),
 ('electronics',6,'drones','Drones'),
 ('electronics',7,'videoprojecteurs','Vidéoprojecteurs'),
 ('electronics',8,'decodeurs-antennes','Décodeurs & antennes'),

 ('informatique',1,'ordinateurs-portables','Ordinateurs portables'),
 ('informatique',2,'ordinateurs','Ordinateurs de bureau'),
 ('informatique',3,'ordinateurs-accessoires','Claviers, souris & accessoires'),
 ('informatique',4,'imprimantes','Imprimantes & scanners'),
 ('informatique',5,'stockage-informatique','Disques durs & clés USB'),
 ('informatique',6,'reseau','Réseau & Wi-Fi'),
 ('informatique',7,'onduleurs','Onduleurs & protection électrique'),
 ('informatique',8,'logiciels','Logiciels'),

 ('electromenager',1,'refrigerateurs','Réfrigérateurs & congélateurs'),
 ('electromenager',2,'cuisinieres','Cuisinières & fours'),
 ('electromenager',3,'machines-a-laver','Machines à laver'),
 ('electromenager',4,'climatiseurs','Climatiseurs'),
 ('electromenager',5,'ventilateurs','Ventilateurs'),
 ('electromenager',6,'fontaines-eau','Fontaines à eau'),
 ('electromenager',7,'petit-electromenager','Petit électroménager'),
 ('electromenager',8,'fers-a-repasser','Fers à repasser'),

 ('kitchen-home',1,'ustensiles-de-cuisine','Ustensiles de cuisine'),
 ('kitchen-home',2,'vaisselle','Vaisselle'),
 ('kitchen-home',3,'rangement','Rangement & organisation'),
 ('kitchen-home',4,'literie','Literie'),
 ('kitchen-home',5,'linge-de-maison','Linge de maison'),
 ('kitchen-home',6,'meubles','Meubles'),
 ('kitchen-home',7,'decoration','Décoration'),
 ('kitchen-home',8,'eclairage','Éclairage'),
 ('kitchen-home',9,'salle-de-bain','Salle de bain'),

 ('fashion',1,'vetements-femme','Vêtements Femme'),
 ('fashion',2,'vetements-homme','Vêtements Homme'),
 ('fashion',3,'chaussures-femme','Chaussures Femme'),
 ('fashion',4,'chaussures-homme','Chaussures Homme'),
 ('fashion',5,'mode-enfant','Mode Enfant'),
 ('fashion',6,'mode-africaine','Mode africaine & pagne'),
 ('fashion',7,'sacs-bagages','Sacs & Bagages'),
 ('fashion',8,'montres','Montres'),
 ('fashion',9,'bijoux','Bijoux'),
 ('fashion',10,'lunettes-de-soleil','Lunettes de soleil'),
 ('fashion',11,'lingerie','Lingerie & sous-vêtements'),

 ('beauty',1,'maquillage','Maquillage'),
 ('beauty',2,'soins-du-visage','Soins du visage'),
 ('beauty',3,'soins-du-corps','Soins du corps'),
 ('beauty',4,'cheveux','Soins des cheveux'),
 ('beauty',5,'parfums','Parfums'),
 ('beauty',6,'hygiene','Hygiène'),
 ('beauty',7,'rasage','Rasage & épilation'),
 ('beauty',8,'manucure','Ongles & manucure'),
 ('beauty',9,'bien-etre','Santé & bien-être'),

 ('bebe-jouets',1,'couches','Couches & lingettes'),
 ('bebe-jouets',2,'alimentation-bebe','Alimentation bébé'),
 ('bebe-jouets',3,'puericulture','Puériculture'),
 ('bebe-jouets',4,'vetements-bebe','Vêtements bébé'),
 ('bebe-jouets',5,'jouets','Jouets & jeux'),

 ('supermarche',1,'alimentation','Épicerie'),
 ('supermarche',2,'boissons','Boissons'),
 ('supermarche',3,'produits-menagers','Produits ménagers'),

 ('sport',1,'fitness','Fitness & musculation'),
 ('sport',2,'sports-collectifs','Football & sports collectifs'),
 ('sport',3,'vetements-sport','Vêtements de sport'),
 ('sport',4,'velos','Vélos & trottinettes'),
 ('sport',5,'plein-air','Camping & plein air'),

 ('jeux-video',1,'consoles','Consoles'),
 ('jeux-video',2,'jeux-video-consoles','Jeux'),
 ('jeux-video',3,'accessoires-gaming','Manettes & accessoires gaming'),

 ('auto-moto',1,'automobile-moto','Accessoires auto'),
 ('auto-moto',2,'pieces-auto','Pièces auto'),
 ('auto-moto',3,'entretien-auto','Huiles & entretien'),
 ('auto-moto',4,'electronique-auto','Électronique auto'),
 ('auto-moto',5,'moto','Motos & accessoires moto'),

 ('home-garden',1,'outillage','Outillage'),
 ('home-garden',2,'quincaillerie','Quincaillerie & électricité'),
 ('home-garden',3,'jardin-exterieur','Jardin & Extérieur'),
 ('home-garden',4,'agriculture-elevage','Agriculture & Élevage'),
 ('home-garden',5,'animalerie','Animalerie'),

 ('livres-papeterie',1,'livres','Livres'),
 ('livres-papeterie',2,'fournitures-scolaires','Fournitures scolaires'),
 ('livres-papeterie',3,'fournitures-bureau','Fournitures de bureau');

-- catégories : mise à jour des existantes (slug conservé), ajout des nouvelles
insert into categories (slug, name, description, sort_order)
select slug, name, description, sort from t_cat
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order,
  description = coalesce(categories.description, excluded.description);

-- sous-catégories : rattachement, nom et ordre ; celles qui existaient gardent leur image et leur adresse
insert into subcategories (category_id, slug, name, sort_order, is_active)
select c.id, s.slug, s.name, s.sort, true from t_sub s join categories c on c.slug = s.cat
on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name, sort_order = excluded.sort_order, is_active = true;

-- produits déjà en ligne : classement dans la bonne sous-catégorie
create temp table t_map (pat text, sub text) on commit drop;
insert into t_map values
 ('Nivea Men Deep Active','soins-du-corps'), ('Bluestork - M-WL-OFF65','ordinateurs-accessoires'),
 ('%Verre Trempé pour iPhone','coques-protections'), ('iPhone 18 Pro','smartphones'),
 ('PlayStation 5 Console','consoles'), ('DJI Mini 3 Pro','drones'), ('Anker PowerBank','stockage-batteries'),
 ('Canon EOS M50','photo-camescopes'), ('Bose QuietComfort 45','casques-ecouteurs'), ('Oraimo FreePods 3','casques-ecouteurs'),
 ('Hisense 43" Smart TV','tv-home-cinema'), ('Apple AirPods Pro 2','casques-ecouteurs'), ('Logitech Wireless Mouse M185','ordinateurs-accessoires'),
 ('Samsung 55" Crystal UHD','tv-home-cinema'), ('JBL Flip 6','enceintes'), ('HP Laptop 15','ordinateurs-portables'),
 ('Samsung Galaxy A15','smartphones'), ('Xiaomi Redmi Note 13','smartphones'), ('Montre Connectée Sport','objets-connectes'),
 ('Sac Homme Cuir','sacs-bagages'), ('Collier Femme Plaqué Or','bijoux'), ('T-shirt Homme Coton','vetements-homme'),
 ('Robe d''été Femme','vetements-femme'), ('Sac à main Femme','sacs-bagages'), ('Escarpins Femme','chaussures-femme'),
 ('Nike Air Max 270','chaussures-homme'), ('Binatone Water Dispenser','fontaines-eau'), ('Nexus Gas Cooker','cuisinieres');

-- produits publiés depuis le site vendeur : la catégorie choisie par le vendeur suit (la publication recalcule le classement)
update seller_products sp set category = s.name
from products p join t_map m on p.title like m.pat || '%' join subcategories s on s.slug = m.sub
where sp.marketplace_product_id = p.id;

-- autres produits
update products p set subcategory_slug = s.slug, category_slug = c.slug
from t_map m join subcategories s on s.slug = m.sub join categories c on c.id = s.category_id
where p.title like m.pat || '%';
delete from subcategories where slug = 'telephones-tablettes' and not exists (select 1 from products p where p.subcategory_slug = 'telephones-tablettes');

-- anciennes sous-catégories en double, sans produit
delete from subcategories s
where s.slug not in (select slug from t_sub)
  and not exists (select 1 from products p where p.subcategory_slug = s.slug);

commit;
