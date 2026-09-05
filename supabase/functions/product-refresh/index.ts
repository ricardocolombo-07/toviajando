// Daily refresh of public.product_cache.
//
// IMPORTANT: this is a curated, manually-priced placeholder catalog, not
// live Amazon data. Getting real prices/images/availability from Amazon
// requires the Creators API (successor to PA-API 5), which needs an
// Amazon Associates account with at least 10 qualifying sales in the past
// 30 days to be approved for credentials. Once that's in place, replace
// CATALOG + buildAffiliateUrl/buildImageUrl below with real SearchItems
// calls (see https://associados.amazon.com.br/creatorsapi/docs/en-us).
//
// Until then, keep prices here updated by hand.
import { createClient } from "npm:@supabase/supabase-js@2";

const AFFILIATE_TAG = "toviajando-20";
const COMMISSION_RATE = 5;
const MAX_AGE_DAYS = 7;

interface CatalogItem {
  name: string;
  price: number;
  query: string;
}

interface CatalogCategory {
  category: string;
  items: CatalogItem[];
}

const CATALOG: CatalogCategory[] = [
  {
    category: "malas",
    items: [
      { name: "Mala de Viagem Grande 360° com Rodinhas", price: 349.9, query: "mala de viagem grande com rodinhas 360" },
      { name: "Mala de Bordo Cabine com USB", price: 199.9, query: "mala de bordo cabine com usb" },
    ],
  },
  {
    category: "adaptadores",
    items: [
      { name: "Adaptador de Tomada Universal Internacional", price: 49.9, query: "adaptador de tomada universal internacional" },
      { name: "Kit Adaptador de Tomada Multipaíses", price: 69.9, query: "kit adaptador de tomada multipaises" },
    ],
  },
  {
    category: "packing_cubes",
    items: [
      { name: "Kit Organizador de Mala (Packing Cubes) 6 Peças", price: 89.9, query: "kit organizador de mala packing cubes 6 pecas" },
      { name: "Organizador de Mala Compressor a Vácuo", price: 119.9, query: "organizador de mala compressor a vacuo" },
    ],
  },
  {
    category: "travesseiros",
    items: [
      { name: "Travesseiro de Pescoço Inflável de Viagem", price: 39.9, query: "travesseiro de pescoco inflavel de viagem" },
      { name: "Travesseiro de Pescoço em Memory Foam", price: 79.9, query: "travesseiro de pescoco memory foam viagem" },
    ],
  },
  {
    category: "power_banks",
    items: [
      { name: "Power Bank 20000mAh Carregamento Rápido", price: 129.9, query: "power bank 20000mah carregamento rapido" },
      { name: "Power Bank Slim 10000mAh USB-C", price: 89.9, query: "power bank slim 10000mah usb-c" },
    ],
  },
  {
    category: "cadeados",
    items: [
      { name: "Cadeado TSA para Mala com Senha", price: 34.9, query: "cadeado tsa para mala com senha" },
      { name: "Cadeado TSA com Trava Antifurto", price: 44.9, query: "cadeado tsa trava antifurto mala" },
    ],
  },
];

function buildAffiliateUrl(query: string): string {
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&tag=${AFFILIATE_TAG}`;
}

// Generic placeholder image -- not a real product photo. Swap for real
// Amazon image URLs once Creators/PA-API access is available.
function buildImageUrl(name: string): string {
  return `https://placehold.co/400x400?text=${encodeURIComponent(name)}`;
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let deletedCount = 0;
  let insertedCount = 0;

  try {
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: deletedRows, error: deleteError } = await supabase
      .from("product_cache")
      .delete()
      .lt("created_at", cutoff)
      .select("id");

    if (deleteError) throw deleteError;
    deletedCount = deletedRows?.length ?? 0;

    const rows = CATALOG.flatMap(({ category, items }) =>
      items.map((item) => ({
        platform: "amazon",
        category,
        name: item.name,
        price: item.price,
        image_url: buildImageUrl(item.name),
        commission_rate: COMMISSION_RATE,
        affiliate_url: buildAffiliateUrl(item.query),
      }))
    );

    const { data: insertedRows, error: insertError } = await supabase
      .from("product_cache")
      .insert(rows)
      .select("id");

    if (insertError) throw insertError;
    insertedCount = insertedRows?.length ?? 0;

    await supabase.from("product_refresh_logs").insert({
      status: "success",
      products_inserted: insertedCount,
      products_deleted: deletedCount,
      message: `Refreshed ${insertedCount} products across ${CATALOG.length} categories.`,
    });

    return new Response(
      JSON.stringify({ status: "success", inserted: insertedCount, deleted: deletedCount }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabase.from("product_refresh_logs").insert({
      status: "error",
      products_inserted: insertedCount,
      products_deleted: deletedCount,
      message,
    });

    return new Response(JSON.stringify({ status: "error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
