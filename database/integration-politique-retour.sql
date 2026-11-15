-- Politique de retour : motifs précis (affichés sur la page « Politique de retour » et dans le formulaire de retour).
-- photo = preuve photo obligatoire ; unused = article neuf, non utilisé, emballage d'origine ; details = explication obligatoire.
create or replace function public.return_reasons() returns jsonb language sql immutable as $$
  select '[
    {"key":"defective","label":"Produit défectueux, en panne ou qui ne fonctionne pas correctement","photo":true,"unused":false,"details":true,"hint":"Décrivez la panne (ce qui ne fonctionne pas, depuis quand) et joignez une photo ou une capture."},
    {"key":"damaged","label":"Produit arrivé endommagé ou cassé","photo":true,"unused":false,"details":false,"hint":"Photographiez le produit et, si possible, l''emballage abîmé."},
    {"key":"wrong_item","label":"Mauvais article reçu (modèle, taille, couleur ou quantité différents de la commande)","photo":true,"unused":true,"details":false,"hint":"Photographiez l''article reçu et son étiquette ; ne l''utilisez pas."},
    {"key":"not_as_described","label":"Ne correspond pas à la description ou aux photos de la fiche","photo":true,"unused":false,"details":true,"hint":"Précisez la différence avec la fiche produit (caractéristique, matière, dimensions…)."},
    {"key":"missing_parts","label":"Pièces, accessoires ou notice manquants","photo":true,"unused":false,"details":true,"hint":"Indiquez les éléments manquants et photographiez le contenu reçu."},
    {"key":"counterfeit","label":"Contrefaçon ou produit non authentique","photo":true,"unused":false,"details":true,"hint":"Expliquez ce qui vous fait douter (logo, numéro de série, finitions) avec des photos."},
    {"key":"expired","label":"Produit périmé ou date de péremption dépassée à la réception","photo":true,"unused":true,"details":false,"hint":"Photographiez clairement la date de péremption."},
    {"key":"size","label":"Taille ou pointure qui ne convient pas","photo":false,"unused":true,"details":false,"hint":"L''article doit être neuf, non porté, avec ses étiquettes et son emballage d''origine."},
    {"key":"changed_mind","label":"Rétractation : je ne souhaite plus l''article","photo":false,"unused":true,"details":false,"hint":"L''article doit être neuf, non utilisé, complet et dans son emballage d''origine. Les frais de retour sont à votre charge."}
  ]'::jsonb;
$$;

-- Le motif qui l'exige doit être expliqué (au moins 15 caractères)
do $$ declare def text; begin
  def := pg_get_functiondef('public.request_return'::regproc);
  if position('''details''' in def) = 0 then
    def := replace(def, $x$  if coalesce(_solution, '') not in ('refund', 'exchange', 'credit') then$x$,
      $x$  if coalesce((rule->>'details')::boolean, false) and length(btrim(coalesce(_details, ''))) < 15 then raise exception 'Expliquez le problème en quelques mots (15 caractères au moins).'; end if;
  if coalesce(_solution, '') not in ('refund', 'exchange', 'credit') then$x$);
    if position('''details''' in def) = 0 then raise exception 'request_return : emplacement introuvable'; end if;
    execute def;
  end if;
end $$;
