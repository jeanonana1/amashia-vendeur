-- Photos d'avis : uniquement des adresses de fichiers (jamais l'image elle-même encodée en texte,
-- qui alourdissait le catalogue téléchargé par chaque visiteur).
alter table public.reviews drop constraint if exists reviews_photos_urls_only;
alter table public.reviews add constraint reviews_photos_urls_only check (photos::text not like '%data:%');
