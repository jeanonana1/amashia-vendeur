-- Commandes vendeur : SKU (code-barres) de chaque article, pour l'étiquette du colis
create or replace view public.seller_orders with (security_invoker = true) as
 SELECT oi.id,
    o.order_number,
    oi.product_id AS listing_id,
    sp.id AS product_id,
    s.owner_id AS seller_id,
    COALESCE(NULLIF(TRIM(BOTH FROM o.full_name), ''::text), 'Client Amashia'::text) AS customer_name,
    concat_ws(', '::text, NULLIF(o.district, ''::text), NULLIF(o.city, ''::text)) AS delivery_area,
    oi.product_title,
    oi.quantity,
    oi.unit_price_fcfa AS unit_price,
    oi.unit_price_fcfa * COALESCE(oi.quantity, 1) - oi.discount_fcfa AS amount,
    COALESCE(o.payment_method, 'À la livraison'::text) AS payment_method,
    false AS paid,
        CASE
            WHEN o.status = 'Annulée'::text THEN 'cancelled'::text
            ELSE oi.seller_status
        END AS status,
    oi.created_at,
    oi.color,
    oi.size AS options,
    ( SELECT p.images ->> 0
           FROM products p
          WHERE p.id = oi.product_id) AS product_image,
    o.id AS order_id,
    oi.discount_fcfa AS discount,
    o.coupon_code,
    oi.commission_pct,
    item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct) AS commission,
    oi.unit_price_fcfa * COALESCE(oi.quantity, 1) - oi.discount_fcfa - item_commission(oi.unit_price_fcfa, oi.quantity, oi.discount_fcfa, oi.commission_pct) AS net_amount,
    oi.sku
   FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN sellers s ON s.id = oi.seller_id
     LEFT JOIN seller_products sp ON sp.marketplace_product_id = oi.product_id
  WHERE s.owner_id = auth.uid();
