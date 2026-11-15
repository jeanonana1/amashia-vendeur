-- Commande sans compte (invité) : mêmes contrôles que la commande normale (stock, prix, coupon, frais de livraison).
-- Les points récompense restent réservés aux comptes. Un coupon ne sert qu'une fois par téléphone / e-mail.
alter table public.orders alter column user_id drop not null;
alter table public.orders add column if not exists is_guest boolean not null default false;

do $$ declare def text; begin
  def := pg_get_functiondef('public.customer_checkout'::regproc);
  if position('guest' in def) = 0 then
    def := replace(def, $x$IF uid IS NULL THEN RAISE EXCEPTION 'Connexion requise'; END IF;$x$,
      $x$IF uid IS NULL AND coalesce(p_details->>'guest','')<>'true' THEN RAISE EXCEPTION 'Connexion requise'; END IF;$x$);
    def := replace(def, $x$hashtextextended(uid::text,0)$x$, $x$hashtextextended(coalesce(uid::text, 'guest-'||p_request::text),0)$x$);
    def := replace(def, $x$WHERE user_id=uid AND request_key=p_request$x$, $x$WHERE user_id IS NOT DISTINCT FROM uid AND request_key=p_request$x$);
    def := replace(def, $x$  IF NOT coalesce((ev->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Code promotionnel : %', ev->>'message'; END IF;$x$,
      $x$  IF NOT coalesce((ev->>'ok')::boolean,false) THEN RAISE EXCEPTION 'Code promotionnel : %', ev->>'message'; END IF;
  IF uid IS NULL AND EXISTS (SELECT 1 FROM public.orders WHERE coupon_code=ev->>'code' AND status<>'Annulée'
       AND (contact_phone=p_details->>'phone' OR lower(contact_email)=lower(coalesce(p_details->>'email','-')))) THEN
   RAISE EXCEPTION 'Code promotionnel : Vous avez déjà utilisé ce coupon.';
  END IF;$x$);
    def := replace(def, $x$IF promo='' AND coalesce(nullif(p_details->>'points','')::int,0) > 0 THEN$x$,
      $x$IF uid IS NOT NULL AND promo='' AND coalesce(nullif(p_details->>'points','')::int,0) > 0 THEN$x$);
    def := replace(def, $x$ DELETE FROM public.cart_items WHERE user_id=uid;$x$,
      $x$ IF uid IS NULL THEN UPDATE public.orders SET is_guest=true WHERE id=oid; ELSE DELETE FROM public.cart_items WHERE user_id=uid; END IF;$x$);
    if (length(def) - length(replace(def, 'guest', ''))) / 5 < 3 or position('IS NOT DISTINCT FROM uid' in def) = 0 or position('uid IS NOT NULL AND promo' in def) = 0 or position('déjà utilisé ce coupon' in def) = 0 then raise exception 'customer_checkout : remplacements incomplets'; end if;
    execute def;
  end if;
end $$;

-- Point d'entrée des invités (aussi utilisable connecté : la commande est alors liée au compte)
create or replace function public.guest_checkout(p_request uuid, p_lines jsonb, p_details jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare oid uuid; o record; phone text := regexp_replace(coalesce(p_details->>'phone', ''), '\s', '', 'g');
begin
  if coalesce(p_details->>'email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide'; end if;
  if length(phone) < 8 then raise exception 'Numéro de téléphone invalide'; end if;
  -- limite anti-abus : 5 commandes sans compte par numéro et par jour
  if auth.uid() is null and (select count(*) from orders where is_guest and regexp_replace(contact_phone, '\s', '', 'g') = phone and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Trop de commandes aujourd''hui avec ce numéro. Créez un compte ou contactez-nous.';
  end if;
  oid := public.customer_checkout(p_request, p_lines, p_details || jsonb_build_object('guest', 'true', 'points', null));
  select order_number, total_fcfa into o from orders where id = oid;
  return jsonb_build_object('order_number', o.order_number, 'total_fcfa', o.total_fcfa);
end $$;
revoke all on function public.guest_checkout(uuid, jsonb, jsonb) from public;
grant execute on function public.guest_checkout(uuid, jsonb, jsonb) to anon, authenticated;
