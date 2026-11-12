import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const angleSchema = z.object({ label: z.string().max(160), why: z.string().max(500) });

export const publishToMarketplace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    productId: z.string().uuid(),
    angles: z.array(angleSchema).max(8),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: product, error: productError } = await context.supabase
      .from("seller_products")
      .select("id,user_id,name,description,category,sku,price,compare_at_price,stock,images,specifications,attributes,variant_images")
      .eq("id", data.productId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (productError) throw new Error(productError.message);
    if (!product) throw new Error("Produit introuvable ou non autorisé.");
    if (!product.name.trim()) throw new Error("Ajoutez un titre avant de publier.");
    if (Number(product.price) <= 0) throw new Error("Ajoutez un prix valide avant de publier.");
    if (!product.images?.length) throw new Error("Ajoutez au moins une image avant de publier.");

    // La publication est faite par la base : un produit "actif" complet est
    // automatiquement visible sur le site client (table products).
    const { data: published, error: publishError } = await (context.supabase as any)
      .from("seller_products")
      .update({ status: "active", marketing_angles: data.angles })
      .eq("id", product.id)
      .eq("user_id", context.userId)
      .select("id,marketplace_product_id,published_at")
      .single();
    if (publishError) throw new Error(publishError.message);
    if (!published?.marketplace_product_id) throw new Error("La publication sur Amashia a échoué.");

    const listing = {
      id: published.marketplace_product_id as string,
      product_id: published.id as string,
      status: "published",
      published_at: (published.published_at as string | null) ?? new Date().toISOString(),
    };
    return { listing };
  });