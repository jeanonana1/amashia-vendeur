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
      .from("products")
      .select("id,user_id,name,description,category,sku,price,compare_at_price,stock,images,specifications,attributes,variant_images")
      .eq("id", data.productId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (productError) throw new Error(productError.message);
    if (!product) throw new Error("Produit introuvable ou non autorisé.");
    if (!product.name.trim()) throw new Error("Ajoutez un titre avant de publier.");
    if (Number(product.price) <= 0) throw new Error("Ajoutez un prix valide avant de publier.");
    if (!product.images?.length) throw new Error("Ajoutez au moins une image avant de publier.");

    const marketplace = context.supabase as any;
    const { data: listing, error: listingError } = await marketplace
      .from("marketplace_listings")
      .upsert({
        product_id: product.id,
        seller_id: context.userId,
        title: product.name,
        description: product.description,
        category: product.category,
        sku: product.sku,
        price: product.price,
        compare_at_price: product.compare_at_price,
        stock: product.stock,
        images: product.images || [],
        specifications: product.specifications || [],
        attributes: product.attributes || [],
        variant_images: product.variant_images || [],
        marketing_angles: data.angles,
        status: "published",
        published_at: new Date().toISOString(),
      }, { onConflict: "product_id" })
      .select("id,product_id,status,published_at")
      .single();

    if (listingError) throw new Error(listingError.message);

    const { error: statusError } = await context.supabase
      .from("products")
      .update({ status: "active" })
      .eq("id", product.id)
      .eq("user_id", context.userId);
    if (statusError) throw new Error(statusError.message);

    return { listing };
  });