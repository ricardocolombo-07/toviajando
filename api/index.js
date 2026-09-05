const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Affiliate partners: search-URL builders keyed by partner id.
// Mercado Livre and Shopee affiliate programs generate tracking links from
// their own dashboard/API rather than a fixed query param — confirm the
// required param names in each partner's affiliate panel before relying on
// these links for commission attribution.
const AFFILIATE_PARTNERS = {
  mercadolivre: {
    name: "Mercado Livre",
    affiliateId: process.env.MERCADO_LIVRE_AFFILIATE_ID,
    buildUrl: (query, affiliateId) =>
      `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}?matt_word=${encodeURIComponent(affiliateId)}`,
  },
  shopee: {
    name: "Shopee",
    affiliateId: process.env.SHOPEE_AFFILIATE_ID,
    buildUrl: (query, affiliateId) =>
      `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}&af_id=${encodeURIComponent(affiliateId)}`,
  },
  amazon: {
    name: "Amazon",
    affiliateId: process.env.AMAZON_AFFILIATE_ID,
    buildUrl: (query, affiliateId) =>
      `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(affiliateId)}`,
  },
};

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", app: "TOVIAJANDO" });
});

// --- Destination search ---

app.get("/api/destinations/:city", async (req, res) => {
  const { city } = req.params;

  const { data, error } = await supabase
    .from("destination_cache")
    .select("*")
    .ilike("city", city)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  if (!data) {
    return res.status(404).json({ error: "Destination not found" });
  }
  res.json(data);
});

// Autocomplete over cached destinations (partial, case-insensitive match).
app.get("/api/search/destination", async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query param 'q' must be at least 2 characters" });
  }

  const { data, error } = await supabase
    .from("destination_cache")
    .select("city, data")
    .ilike("city", `%${q.trim()}%`)
    .order("city", { ascending: true })
    .limit(10);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// --- Products (affiliate search links) ---

app.get("/api/products/partners", (req, res) => {
  const partners = Object.entries(AFFILIATE_PARTNERS)
    .filter(([, partner]) => Boolean(partner.affiliateId))
    .map(([id, partner]) => ({ id, name: partner.name }));
  res.json(partners);
});

app.get("/api/products/search", (req, res) => {
  const { q, partner } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Query param 'q' is required" });
  }

  const partnerIds = partner ? [partner] : Object.keys(AFFILIATE_PARTNERS);
  const results = [];

  for (const id of partnerIds) {
    const config = AFFILIATE_PARTNERS[id];
    if (!config || !config.affiliateId) continue;
    results.push({
      partner: id,
      name: config.name,
      url: config.buildUrl(q, config.affiliateId),
    });
  }

  if (partner && results.length === 0) {
    return res.status(404).json({ error: `Unknown or unconfigured partner '${partner}'` });
  }

  res.json(results);
});

// --- Coupons ---

app.get("/api/coupons", async (req, res) => {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

app.get("/api/coupons/urgent", async (req, res) => {
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("is_urgent", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// --- Itinerary generation ---

// Category rotation per travel profile, used to build a quick, unsaved
// preview. This is a placeholder template generator, not real curated
// content — replace with a proper recommendation source later.
const PROFILE_CATEGORIES = {
  relaxante: ["relax", "gastronomia", "natureza"],
  aventura: ["natureza", "sightseeing", "esportes"],
  cultural: ["cultura", "sightseeing", "gastronomia"],
  familia: ["sightseeing", "natureza", "gastronomia"],
  romantico: ["gastronomia", "relax", "sightseeing"],
  geral: ["sightseeing", "gastronomia", "cultura"],
};

const CATEGORY_TITLES = {
  sightseeing: (destination) => `Passeio pelos pontos turísticos de ${destination}`,
  gastronomia: (destination) => `Experiência gastronômica em ${destination}`,
  natureza: (destination) => `Contato com a natureza em ${destination}`,
  cultura: (destination) => `Imersão cultural em ${destination}`,
  relax: (destination) => `Dia de relaxamento em ${destination}`,
  esportes: (destination) => `Atividades de aventura em ${destination}`,
};

// Stateless preview: builds a sample day-by-day itinerary without touching
// the database. Used by the wizard before the user commits to a full plan.
app.get("/api/itinerary/generate", (req, res) => {
  const { destination, profile, days } = req.query;
  const numDays = Number(days);

  if (!destination) {
    return res.status(400).json({ error: "Query param 'destination' is required" });
  }
  if (!Number.isInteger(numDays) || numDays < 1 || numDays > 14) {
    return res.status(400).json({ error: "Query param 'days' must be an integer between 1 and 14" });
  }

  const categories = PROFILE_CATEGORIES[profile] || PROFILE_CATEGORIES.geral;
  const itinerary = [];

  for (let day = 1; day <= numDays; day++) {
    const morningCategory = categories[(day * 2) % categories.length];
    const afternoonCategory = categories[(day * 2 + 1) % categories.length];
    itinerary.push({
      day,
      activities: [
        { period: "Manhã", category: morningCategory, title: CATEGORY_TITLES[morningCategory](destination) },
        { period: "Tarde", category: afternoonCategory, title: CATEGORY_TITLES[afternoonCategory](destination) },
      ],
    });
  }

  res.json({
    destination,
    profile: profile || "geral",
    days: numDays,
    itinerary,
  });
});

app.post("/api/itinerary/generate", async (req, res) => {
  const { destination, user_id, activities } = req.body;

  if (!destination || !Array.isArray(activities) || activities.length === 0) {
    return res.status(400).json({ error: "'destination' and non-empty 'activities' array are required" });
  }

  const rows = activities.map((activity) => ({
    user_id: user_id || null,
    destination,
    activity_name: activity.activity_name,
    activity_date: activity.activity_date || null,
    activity_time: activity.activity_time || null,
    category: activity.category || null,
    ticket_url: activity.ticket_url || null,
  }));

  const { data, error } = await supabase.from("activities").insert(rows).select();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

app.get("/api/itinerary/:destination", async (req, res) => {
  const { destination } = req.params;
  const { user_id } = req.query;

  let query = supabase
    .from("activities")
    .select("*")
    .ilike("destination", destination)
    .order("activity_date", { ascending: true })
    .order("activity_time", { ascending: true });

  if (user_id) {
    query = query.eq("user_id", user_id);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// --- Affiliate click tracking ---

app.post("/api/affiliate/click", async (req, res) => {
  const { partner, product_url, destination, user_id } = req.body;

  if (!partner || !product_url) {
    return res.status(400).json({ error: "'partner' and 'product_url' are required" });
  }

  const { data, error } = await supabase
    .from("affiliate_clicks")
    .insert({
      partner,
      product_url,
      destination: destination || null,
      user_id: user_id || null,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 TOVIAJANDO em http://localhost:${PORT}`);
});

module.exports = app;
