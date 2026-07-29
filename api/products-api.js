import { CATALOGUE } from "../src/catalogue.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { section, category, query, minPrice, maxPrice } = req.query;

  // Flatten the catalogue to get all items
  let allItems = [];
  try {
    Object.entries(CATALOGUE).forEach(([secKey, sec]) => {
      if (sec && sec.categories) {
        Object.entries(sec.categories).forEach(([catKey, cat]) => {
          if (cat && cat.items) {
            cat.items.forEach(item => {
              allItems.push({
                ...item,
                section: secKey,
                category: catKey,
                sectionLabel: sec.label,
                categoryLabel: cat.label
              });
            });
          }
        });
      }
    });

    // Apply filters
    if (section) {
      allItems = allItems.filter(item => item.section.toLowerCase() === section.toLowerCase());
    }
    if (category) {
      allItems = allItems.filter(item => item.category.toLowerCase() === category.toLowerCase());
    }
    if (minPrice) {
      allItems = allItems.filter(item => item.price >= Number(minPrice));
    }
    if (maxPrice) {
      allItems = allItems.filter(item => item.price <= Number(maxPrice));
    }
    if (query) {
      const q = query.toLowerCase();
      allItems = allItems.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.desc.toLowerCase().includes(q)
      );
    }

    return res.status(200).json({ products: allItems });
  } catch (err) {
    console.error("[products api] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
