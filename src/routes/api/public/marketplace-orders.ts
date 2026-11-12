import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const orderSchema = z.object({
  productId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerContact: z.string().trim().min(5).max(120),
  deliveryAddress: z.string().trim().min(5).max(300),
  quantity: z.number().int().min(1).max(100),
  paymentMethod: z.enum(["À la livraison", "Mobile Money"]),
});

export const Route = createFileRoute("/api/public/marketplace-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof orderSchema>;
        try {
          input = orderSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Informations de commande invalides." }, { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const rpc = supabaseAdmin as any;
        const { data, error } = await rpc.rpc("place_marketplace_order", {
          _product_id: input.productId,
          _customer_name: input.customerName,
          _customer_contact: input.customerContact,
          _delivery_address: input.deliveryAddress,
          _quantity: input.quantity,
          _payment_method: input.paymentMethod,
        });

        if (error) {
          const message = error.message.includes("Stock insuffisant")
            ? "La quantité demandée n’est plus disponible."
            : error.message.includes("indisponible") || error.message.includes("non publiée")
              ? "Ce produit n’est plus disponible."
              : "La commande n’a pas pu être enregistrée.";
          return Response.json({ error: message }, { status: 409 });
        }

        return Response.json({ order: Array.isArray(data) ? data[0] : data }, { status: 201 });
      },
    },
  },
});