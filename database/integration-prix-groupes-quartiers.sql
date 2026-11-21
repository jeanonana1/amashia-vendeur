-- Prix de livraison par groupe de quartiers : on sélectionne plusieurs quartiers d'une ville,
-- on leur donne un nom de groupe (ex. « Centre-ville ») et un prix ; ce prix est appliqué au paiement (delivery_quote_v2).
alter table public.cm_districts add column if not exists price_group text;

create or replace function public.admin_districts(_city text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.admin_guard('admin_districts');
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'source', source, 'note', note, 'fee', fee, 'price_group', price_group,
      'is_active', is_active, 'region', region, 'city', city) order by name)
    from cm_districts where (_city is null or lower(city) = lower(_city))), '[]'::jsonb);
end $$;

-- _fee null = le quartier reprend le prix de la ville
create or replace function public.admin_set_districts_price(_region text, _city text, _names text[], _fee integer, _group text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare nm text; n text; cnt int := 0; g text := nullif(btrim(coalesce(_group, '')), '');
begin
  perform public.admin_guard('admin_set_districts_price');
  if coalesce(btrim(_city), '') = '' then raise exception 'Choisissez d''abord la ville.'; end if;
  if _names is null or array_length(_names, 1) is null then raise exception 'Sélectionnez au moins un quartier.'; end if;
  if _fee is not null and (_fee < 0 or _fee > 1000000) then raise exception 'Prix invalide.'; end if;
  if g is not null and length(g) > 60 then raise exception 'Nom de groupe trop long.'; end if;
  foreach nm in array _names loop
    n := btrim(regexp_replace(coalesce(nm, ''), '\s+', ' ', 'g'));
    continue when length(n) < 2 or length(n) > 60;
    insert into cm_districts (region, city, name, source, created_by, fee, price_group)
    values (coalesce(nullif(btrim(_region), ''), '—'), btrim(_city), n, 'admin', auth.uid(), _fee, case when _fee is null then null else g end)
    on conflict do nothing;
    update cm_districts set fee = _fee, price_group = case when _fee is null then null else g end, updated_at = now()
      where lower(city) = lower(btrim(_city)) and lower(name) = lower(n);
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

insert into public.admin_fn_sections (fn, sections) values ('admin_set_districts_price', array['livraison','livreurs'])
on conflict (fn) do update set sections = excluded.sections;
