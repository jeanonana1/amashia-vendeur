-- Le prix normal (barré) doit être strictement supérieur au prix de vente.
alter table seller_products drop constraint if exists seller_products_compare_gt_price;
alter table seller_products add constraint seller_products_compare_gt_price
  check (compare_at_price is null or compare_at_price = 0 or compare_at_price > price);
