import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchParamsSchema } from "@shared/schema";
import type {
  CondoListing,
  ScoreBreakdown,
  MarketStats,
  SearchResult,
  SearchParams,
  PriceReduction,
  SchoolInfo,
} from "@shared/schema";

// In-memory API key storage (per-session)
let storedApiKey: string | null = null;

// --- SEEDED PRNG (deterministic random) ---
function createSeededRng(seed: number) {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// --- SCORING ENGINE (9 dimensions, 100 pts total) ---

function calculateDealScore(
  listing: Omit<CondoListing, "dealScore" | "scoreBreakdown" | "scoreLabel">,
  stats: MarketStats
): { dealScore: number; scoreBreakdown: ScoreBreakdown; scoreLabel: CondoListing["scoreLabel"] } {
  const breakdown: ScoreBreakdown = {
    hoaBurdenScore: 0,
    pricePerSqftScore: 0,
    totalCostScore: 0,
    buildingAgeScore: 0,
    daysOnMarketScore: 0,
    assessmentRiskScore: 0,
    schoolQualityScore: 0,
    floodRiskScore: 0,
    valueGapScore: 0,
  };

  const monthlyRate = 0.065 / 12;
  const numPayments = 360;
  const monthlyMortgage =
    (listing.price * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  // 1. HOA Burden Score (0-20)
  const hoaPercent = monthlyMortgage > 0
    ? (listing.totalMonthlyFees / monthlyMortgage) * 100
    : 100;

  if (hoaPercent <= 10) breakdown.hoaBurdenScore = 20;
  else if (hoaPercent <= 15) breakdown.hoaBurdenScore = 17;
  else if (hoaPercent <= 20) breakdown.hoaBurdenScore = 14;
  else if (hoaPercent <= 30) breakdown.hoaBurdenScore = 10;
  else if (hoaPercent <= 40) breakdown.hoaBurdenScore = 5;
  else breakdown.hoaBurdenScore = 2;

  // 2. Price per Sqft Score (0-15)
  if (listing.pricePerSqft && stats.medianPricePerSqft > 0) {
    const ratio = listing.pricePerSqft / stats.medianPricePerSqft;
    if (ratio <= 0.75) breakdown.pricePerSqftScore = 15;
    else if (ratio <= 0.85) breakdown.pricePerSqftScore = 13;
    else if (ratio <= 0.95) breakdown.pricePerSqftScore = 10;
    else if (ratio <= 1.05) breakdown.pricePerSqftScore = 7;
    else if (ratio <= 1.15) breakdown.pricePerSqftScore = 4;
    else if (ratio <= 1.3) breakdown.pricePerSqftScore = 2;
    else breakdown.pricePerSqftScore = 1;
  } else {
    breakdown.pricePerSqftScore = 7;
  }

  // 3. Total Monthly Cost Score (0-15)
  const totalMonthlyCost = monthlyMortgage + listing.totalMonthlyFees;
  const medianMonthly =
    (stats.medianPrice * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1) +
    stats.medianHoa;

  if (medianMonthly > 0) {
    const costRatio = totalMonthlyCost / medianMonthly;
    if (costRatio <= 0.7) breakdown.totalCostScore = 15;
    else if (costRatio <= 0.85) breakdown.totalCostScore = 13;
    else if (costRatio <= 0.95) breakdown.totalCostScore = 10;
    else if (costRatio <= 1.05) breakdown.totalCostScore = 7;
    else if (costRatio <= 1.2) breakdown.totalCostScore = 4;
    else breakdown.totalCostScore = 1;
  } else {
    breakdown.totalCostScore = 7;
  }

  // 4. Building Age Score (0-10)
  const currentYear = new Date().getFullYear();
  if (listing.yearBuilt) {
    const age = currentYear - listing.yearBuilt;
    if (age <= 5) breakdown.buildingAgeScore = 10;
    else if (age <= 10) breakdown.buildingAgeScore = 9;
    else if (age <= 20) breakdown.buildingAgeScore = 7;
    else if (age <= 30) breakdown.buildingAgeScore = 5;
    else if (age <= 40) breakdown.buildingAgeScore = 3;
    else if (age <= 50) breakdown.buildingAgeScore = 2;
    else breakdown.buildingAgeScore = 1;
  } else {
    breakdown.buildingAgeScore = 5;
  }

  // 5. Days on Market Score (0-5)
  if (listing.daysOnMarket !== null) {
    if (listing.daysOnMarket >= 90) breakdown.daysOnMarketScore = 5;
    else if (listing.daysOnMarket >= 60) breakdown.daysOnMarketScore = 4;
    else if (listing.daysOnMarket >= 30) breakdown.daysOnMarketScore = 3;
    else if (listing.daysOnMarket >= 14) breakdown.daysOnMarketScore = 2;
    else breakdown.daysOnMarketScore = 1;
  } else {
    breakdown.daysOnMarketScore = 2;
  }

  // 6. Assessment Risk Score (0-5)
  if (!listing.assessmentFee || listing.assessmentFee === 0) {
    breakdown.assessmentRiskScore = 5;
  } else if (listing.assessmentFee <= 100) {
    breakdown.assessmentRiskScore = 3;
  } else if (listing.assessmentFee <= 300) {
    breakdown.assessmentRiskScore = 2;
  } else {
    breakdown.assessmentRiskScore = 1;
  }

  // 7. School Quality Score (0-10)
  if (listing.avgSchoolRating !== null) {
    if (listing.avgSchoolRating >= 9) breakdown.schoolQualityScore = 10;
    else if (listing.avgSchoolRating >= 8) breakdown.schoolQualityScore = 9;
    else if (listing.avgSchoolRating >= 7) breakdown.schoolQualityScore = 7;
    else if (listing.avgSchoolRating >= 6) breakdown.schoolQualityScore = 5;
    else if (listing.avgSchoolRating >= 5) breakdown.schoolQualityScore = 4;
    else if (listing.avgSchoolRating >= 4) breakdown.schoolQualityScore = 3;
    else breakdown.schoolQualityScore = 1;
  } else {
    breakdown.schoolQualityScore = 5;
  }

  // 8. Flood Risk Score (0-5)
  if (listing.floodFactorScore !== null) {
    if (listing.floodFactorScore <= 1) breakdown.floodRiskScore = 5;
    else if (listing.floodFactorScore <= 2) breakdown.floodRiskScore = 4;
    else if (listing.floodFactorScore <= 4) breakdown.floodRiskScore = 3;
    else if (listing.floodFactorScore <= 6) breakdown.floodRiskScore = 2;
    else breakdown.floodRiskScore = 1;
  } else {
    breakdown.floodRiskScore = 3;
  }

  // 9. Value Gap Score (0-15): priced below estimated value = great deal
  if (listing.valueGapPercent !== null) {
    const gap = listing.valueGapPercent; // negative = below estimate
    if (gap <= -15) breakdown.valueGapScore = 15;
    else if (gap <= -10) breakdown.valueGapScore = 13;
    else if (gap <= -5) breakdown.valueGapScore = 11;
    else if (gap <= 0) breakdown.valueGapScore = 8;
    else if (gap <= 5) breakdown.valueGapScore = 5;
    else if (gap <= 10) breakdown.valueGapScore = 3;
    else breakdown.valueGapScore = 1;
  } else {
    breakdown.valueGapScore = 7;
  }

  const dealScore =
    breakdown.hoaBurdenScore +
    breakdown.pricePerSqftScore +
    breakdown.totalCostScore +
    breakdown.buildingAgeScore +
    breakdown.daysOnMarketScore +
    breakdown.assessmentRiskScore +
    breakdown.schoolQualityScore +
    breakdown.floodRiskScore +
    breakdown.valueGapScore;

  let scoreLabel: CondoListing["scoreLabel"];
  if (dealScore >= 80) scoreLabel = "Great Deal";
  else if (dealScore >= 65) scoreLabel = "Good Deal";
  else if (dealScore >= 45) scoreLabel = "Fair";
  else if (dealScore >= 30) scoreLabel = "Overpriced";
  else scoreLabel = "Avoid";

  return { dealScore, scoreBreakdown: breakdown, scoreLabel };
}

// --- API FETCHERS ---

interface RawListing {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  hoaFee: number | null;
  assessmentFee: number | null;
  daysOnMarket: number | null;
  yearBuilt: number | null;
  listingUrl: string | null;
  photoUrl: string | null;
  propertyType: string;
  source: string;
  // New location & value fields
  avgSchoolRating: number | null;
  schools: SchoolInfo[];
  floodFactorScore: number | null;
  femaZone: string | null;
  estimatedValue: number | null;
  priceReductions: PriceReduction[];
  originalListPrice: number | null;
}

interface PropertyDetail {
  hoaFee: number | null;
  assessmentFee: number | null;
  yearBuilt: number | null;
  avgSchoolRating: number | null;
  schools: SchoolInfo[];
  floodFactorScore: number | null;
  femaZone: string | null;
  estimatedValue: number | null;
  priceReductions: PriceReduction[];
  originalListPrice: number | null;
}

// Fetch property detail for all enrichment data
async function fetchPropertyDetail(
  apiKey: string,
  propertyId: string
): Promise<PropertyDetail> {
  const empty: PropertyDetail = {
    hoaFee: null, assessmentFee: null, yearBuilt: null,
    avgSchoolRating: null, schools: [], floodFactorScore: null,
    femaZone: null, estimatedValue: null, priceReductions: [],
    originalListPrice: null,
  };

  try {
    const detailRes = await fetch(
      `https://realty-in-us.p.rapidapi.com/properties/v3/detail?property_id=${propertyId}`,
      {
        headers: {
          "x-rapidapi-key": apiKey,
          "x-rapidapi-host": "realty-in-us.p.rapidapi.com",
        },
      }
    );
    if (!detailRes.ok) return empty;

    const data = await detailRes.json();
    const home = data?.data?.home;
    if (!home) return empty;

    // --- HOA Fee ---
    let hoaFee = home.hoa?.fee ?? null;
    if (hoaFee === null && home.description?.text) {
      const text = home.description.text;
      const patterns = [
        /\$([\d,]+)(?:\.\d+)?\s*\/\s*(?:mo|month)\s*(?:hoa|maintenance|common\s*charge)/i,
        /(?:hoa|maintenance|common\s*charge)\s*(?:fee|fees|of|is|are|:|=)?\s*\$([\d,]+)/i,
        /\$([\d,]+)(?:\.\d+)?\s*(?:per\s*month|monthly|\/mo)\s*(?:hoa|maintenance)/i,
        /(?:hoa|maintenance)\s*(?:fee|fees)?\s*(?:of|is|are)?\s*(?:approximately|about|around)?\s*\$([\d,]+)/i,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const parsed = parseInt(match[1].replace(/,/g, ""), 10);
          if (parsed >= 50 && parsed <= 10000) {
            hoaFee = parsed;
            break;
          }
        }
      }
    }

    // --- Year Built ---
    const yearBuilt = home.description?.year_built ?? null;

    // --- Assessment Fee ---
    let assessmentFee: number | null = null;
    if (home.details) {
      for (const section of home.details) {
        const sectionJson = JSON.stringify(section).toLowerCase();
        if (sectionJson.includes("special assessment") || sectionJson.includes("assessment fee")) {
          const texts: string[] = section.text || [];
          for (const t of texts) {
            const match = t.match(/(?:special\s*)?assessment[^$]*\$([\d,]+)/i)
              || t.match(/\$([\d,]+)[^$]*(?:special\s*)?assessment/i);
            if (match) {
              const parsed = parseInt(match[1].replace(/,/g, ""), 10);
              if (parsed > 0 && parsed < 50000) {
                assessmentFee = parsed;
                break;
              }
            }
          }
        }
      }
    }

    // --- Schools ---
    const nearbySchools = home.nearby_schools?.schools || [];
    const schools: SchoolInfo[] = [];
    const ratedSchoolScores: number[] = [];

    for (const s of nearbySchools) {
      if (s.rating && s.name) {
        const levels = s.education_levels || [];
        const level = levels.includes("high") ? "high"
          : levels.includes("middle") ? "middle"
          : levels.includes("elementary") ? "elementary"
          : levels[0] || "unknown";

        schools.push({
          name: s.name,
          rating: s.rating,
          level,
          distanceMiles: s.distance_in_miles || 0,
        });

        // Only use assigned schools for the average (or all rated if none are assigned)
        if (s.assigned === true || s.assigned === null) {
          ratedSchoolScores.push(s.rating);
        }
      }
    }

    const avgSchoolRating = ratedSchoolScores.length > 0
      ? Math.round((ratedSchoolScores.reduce((a, b) => a + b, 0) / ratedSchoolScores.length) * 10) / 10
      : null;

    // --- Flood Risk ---
    const floodFactorScore = home.local?.flood?.flood_factor_score ?? null;
    const femaZones = home.local?.flood?.fema_zone;
    const femaZone = Array.isArray(femaZones) ? femaZones[0] || null : femaZones || null;

    // --- Property Value Estimates ---
    const estimates = home.estimates?.current_values || [];
    const validEstimates = estimates.filter((e: any) => e.estimate && e.estimate > 0);
    const estimatedValue = validEstimates.length > 0
      ? Math.round(validEstimates.reduce((sum: number, e: any) => sum + e.estimate, 0) / validEstimates.length)
      : null;

    // --- Price Reduction History ---
    const history = home.property_history || [];
    const priceReductions: PriceReduction[] = [];
    let originalListPrice: number | null = null;

    // Sort history by date ascending to find price drops chronologically
    const sortedHistory = [...history]
      .filter((h: any) => h.date && h.price && h.price > 0)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Track listed prices to detect reductions
    let lastListedPrice: number | null = null;
    for (const event of sortedHistory) {
      const eventName = (event.event_name || "").toLowerCase();
      const price = event.price;

      if (eventName.includes("listed") && !eventName.includes("removed")) {
        if (originalListPrice === null) {
          originalListPrice = price;
        }
        if (lastListedPrice !== null && price < lastListedPrice) {
          const dropAmount = lastListedPrice - price;
          const dropPercent = Math.round((dropAmount / lastListedPrice) * 1000) / 10;
          priceReductions.push({
            date: event.date,
            previousPrice: lastListedPrice,
            newPrice: price,
            dropAmount,
            dropPercent,
          });
        }
        lastListedPrice = price;
      }

      // Also detect "Price Changed" events
      if (eventName.includes("price") && eventName.includes("change")) {
        if (lastListedPrice !== null && price < lastListedPrice) {
          const dropAmount = lastListedPrice - price;
          const dropPercent = Math.round((dropAmount / lastListedPrice) * 1000) / 10;
          priceReductions.push({
            date: event.date,
            previousPrice: lastListedPrice,
            newPrice: price,
            dropAmount,
            dropPercent,
          });
        }
        if (price > 0) lastListedPrice = price;
      }
    }

    return {
      hoaFee, assessmentFee, yearBuilt,
      avgSchoolRating, schools: schools.slice(0, 6), // Top 6 schools
      floodFactorScore, femaZone,
      estimatedValue, priceReductions, originalListPrice,
    };
  } catch {
    return empty;
  }
}

// Batch fetch details for multiple properties (parallel with throttling)
async function enrichListingsWithDetails(
  apiKey: string,
  listings: RawListing[]
): Promise<RawListing[]> {
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 500;
  const enriched = [...listings];

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    const detailResults = await Promise.all(
      batch.map((listing) => fetchPropertyDetail(apiKey, listing.id))
    );

    detailResults.forEach((detail, j) => {
      const idx = i + j;
      enriched[idx] = {
        ...enriched[idx],
        hoaFee: detail.hoaFee ?? enriched[idx].hoaFee,
        assessmentFee: detail.assessmentFee ?? enriched[idx].assessmentFee,
        yearBuilt: detail.yearBuilt ?? enriched[idx].yearBuilt,
        avgSchoolRating: detail.avgSchoolRating ?? enriched[idx].avgSchoolRating,
        schools: detail.schools.length > 0 ? detail.schools : enriched[idx].schools,
        floodFactorScore: detail.floodFactorScore ?? enriched[idx].floodFactorScore,
        femaZone: detail.femaZone ?? enriched[idx].femaZone,
        estimatedValue: detail.estimatedValue ?? enriched[idx].estimatedValue,
        priceReductions: detail.priceReductions.length > 0 ? detail.priceReductions : enriched[idx].priceReductions,
        originalListPrice: detail.originalListPrice ?? enriched[idx].originalListPrice,
      };
    });

    if (i + BATCH_SIZE < listings.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return enriched;
}

async function fetchFromRealtorAPI(
  apiKey: string,
  location: string,
  propertyTypes?: string[],
  bedrooms?: string,
  bathrooms?: string,
  minPrice?: number,
  maxPrice?: number
): Promise<RawListing[]> {
  const autoCompleteUrl = `https://realty-in-us.p.rapidapi.com/locations/v2/auto-complete?input=${encodeURIComponent(location)}&limit=1`;

  const acRes = await fetch(autoCompleteUrl, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "realty-in-us.p.rapidapi.com",
    },
  });

  if (!acRes.ok) {
    const errText = await acRes.text();
    throw new Error(`API auto-complete failed (${acRes.status}): ${errText}`);
  }

  const acData = await acRes.json();
  const autocomplete = acData.autocomplete || [];
  if (autocomplete.length === 0) {
    throw new Error(`No location found for "${location}". Try a zip code, city name, or address.`);
  }

  const searchUrl = "https://realty-in-us.p.rapidapi.com/properties/v3/list";
  
  const filters: any = {
    status: ["for_sale"],
    type: propertyTypes && propertyTypes.length > 0 ? propertyTypes : ["condos"],
  };

  if (bedrooms && bedrooms !== "any") {
    const bedsNum = parseInt(bedrooms, 10);
    if (!isNaN(bedsNum)) {
      filters.beds = { min: bedsNum, max: bedsNum };
    }
  }
  if (bathrooms && bathrooms !== "any") {
    const bathsNum = parseInt(bathrooms, 10);
    if (!isNaN(bathsNum)) {
      filters.baths = { min: bathsNum };
    }
  }
  if (minPrice || maxPrice) {
    filters.list_price = {};
    if (minPrice) filters.list_price.min = minPrice;
    if (maxPrice) filters.list_price.max = maxPrice;
  }

  const firstResult = autocomplete[0];
  let searchBody: any = {
    limit: 20,
    offset: 0,
    ...filters,
  };

  if (firstResult.area_type === "postal_code") {
    searchBody.postal_code = firstResult.mpr_id || location;
  } else if (firstResult.area_type === "city") {
    searchBody.city = firstResult.city;
    searchBody.state_code = firstResult.state_code;
  } else if (firstResult.area_type === "state") {
    searchBody.state_code = firstResult.state_code;
  } else {
    if (firstResult.city && firstResult.state_code) {
      searchBody.city = firstResult.city;
      searchBody.state_code = firstResult.state_code;
    } else {
      searchBody.postal_code = location;
    }
  }

  const searchRes = await fetch(searchUrl, {
    method: "POST",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": "realty-in-us.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(searchBody),
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`API search failed (${searchRes.status}): ${errText}`);
  }

  const searchData = await searchRes.json();
  const results = searchData?.data?.home_search?.results || [];

  const baseListings: RawListing[] = results.map((r: any) => {
    const loc = r.location || {};
    const addr = loc.address || {};
    const desc = r.description || {};

    const rawType = desc.type || r.prop_type || "condo";
    const typeMap: Record<string, string> = {
      condo: "Condo", condos: "Condo",
      condo_townhome: "Condo / Townhome",
      condo_townhome_rowhome_coop: "Condo / Townhome / Rowhome / Co-op",
      townhomes: "Townhome", townhome: "Townhome",
      condop: "Condop", coop: "Co-op", cooperative: "Co-op", rowhome: "Rowhome",
    };
    const propertyType = typeMap[rawType.toLowerCase()] || rawType;

    // List endpoint may include an estimate
    const listEstimate = r.estimate?.estimate || null;

    return {
      id: r.property_id || `${addr.line}-${addr.postal_code}`,
      address: addr.line || "Address unavailable",
      city: addr.city || "",
      state: addr.state_code || addr.state || "",
      zipCode: addr.postal_code || "",
      price: r.list_price || 0,
      bedrooms: desc.beds || 0,
      bathrooms: desc.baths || 0,
      sqft: desc.sqft || null,
      hoaFee: null,
      assessmentFee: null,
      daysOnMarket: r.list_date
        ? Math.floor((new Date(new Date().toISOString().slice(0, 10)).getTime() - new Date(r.list_date).getTime()) / (1000 * 60 * 60 * 24))
        : null,
      yearBuilt: desc.year_built || null,
      listingUrl: r.href
        ? (r.href.startsWith("http") ? r.href : `https://www.realtor.com${r.href}`)
        : null,
      photoUrl: r.primary_photo?.href || (r.photos?.[0]?.href) || null,
      propertyType,
      source: "Realtor.com",
      avgSchoolRating: null,
      schools: [],
      floodFactorScore: null,
      femaZone: null,
      estimatedValue: listEstimate,
      priceReductions: [],
      originalListPrice: null,
    };
  });

  // Enrich with detail data
  console.log(`Enriching ${baseListings.length} listings with detail data...`);
  const enriched = await enrichListingsWithDetails(apiKey, baseListings);
  const hoaCount = enriched.filter(l => l.hoaFee !== null).length;
  const schoolCount = enriched.filter(l => l.avgSchoolRating !== null).length;
  const estimateCount = enriched.filter(l => l.estimatedValue !== null).length;
  console.log(`Data coverage: HOA ${hoaCount}/${enriched.length}, Schools ${schoolCount}/${enriched.length}, Estimates ${estimateCount}/${enriched.length}`);

  return enriched;
}

// --- DEMO DATA GENERATOR (fully deterministic) ---

function generateDemoListings(
  location: string,
  propertyTypes?: string[],
  bedrooms?: string,
  bathrooms?: string,
  minPrice?: number,
  maxPrice?: number
): RawListing[] {
  const seedStr = [
    location.toLowerCase().trim(),
    (propertyTypes || ["condos"]).sort().join(","),
    bedrooms || "any",
    bathrooms || "any",
    String(minPrice || 0),
    String(maxPrice || 0),
  ].join("|");
  const rand = createSeededRng(hashString(seedStr));

  const cities: Record<string, { city: string; state: string; zip: string; basePrice: number; baseHoa: number; schoolBase: number; floodBase: number }> = {
    "94401": { city: "San Mateo", state: "CA", zip: "94401", basePrice: 650000, baseHoa: 450, schoolBase: 7, floodBase: 2 },
    "94402": { city: "San Mateo", state: "CA", zip: "94402", basePrice: 720000, baseHoa: 500, schoolBase: 8, floodBase: 1 },
    "33139": { city: "Miami Beach", state: "FL", zip: "33139", basePrice: 480000, baseHoa: 620, schoolBase: 5, floodBase: 6 },
    "33130": { city: "Miami", state: "FL", zip: "33130", basePrice: 420000, baseHoa: 580, schoolBase: 5, floodBase: 4 },
    "10001": { city: "New York", state: "NY", zip: "10001", basePrice: 850000, baseHoa: 700, schoolBase: 6, floodBase: 3 },
    "10019": { city: "New York", state: "NY", zip: "10019", basePrice: 1200000, baseHoa: 900, schoolBase: 7, floodBase: 2 },
    "60601": { city: "Chicago", state: "IL", zip: "60601", basePrice: 380000, baseHoa: 420, schoolBase: 6, floodBase: 2 },
    "60611": { city: "Chicago", state: "IL", zip: "60611", basePrice: 450000, baseHoa: 520, schoolBase: 7, floodBase: 1 },
    "90015": { city: "Los Angeles", state: "CA", zip: "90015", basePrice: 580000, baseHoa: 480, schoolBase: 5, floodBase: 2 },
    "98101": { city: "Seattle", state: "WA", zip: "98101", basePrice: 520000, baseHoa: 400, schoolBase: 7, floodBase: 1 },
    "78701": { city: "Austin", state: "TX", zip: "78701", basePrice: 350000, baseHoa: 320, schoolBase: 7, floodBase: 3 },
    "30301": { city: "Atlanta", state: "GA", zip: "30301", basePrice: 310000, baseHoa: 280, schoolBase: 6, floodBase: 2 },
    "80202": { city: "Denver", state: "CO", zip: "80202", basePrice: 420000, baseHoa: 350, schoolBase: 7, floodBase: 1 },
    "85001": { city: "Phoenix", state: "AZ", zip: "85001", basePrice: 280000, baseHoa: 220, schoolBase: 5, floodBase: 1 },
    "92101": { city: "San Diego", state: "CA", zip: "92101", basePrice: 590000, baseHoa: 430, schoolBase: 7, floodBase: 2 },
  };

  const locLower = location.toLowerCase().trim();
  let config = cities[locLower];

  if (!config) {
    for (const [, c] of Object.entries(cities)) {
      if (c.city.toLowerCase().includes(locLower) || locLower.includes(c.city.toLowerCase())) {
        config = c;
        break;
      }
    }
  }

  if (!config) {
    config = { city: location, state: "US", zip: locLower.slice(0, 5) || "00000", basePrice: 400000, baseHoa: 380, schoolBase: 6, floodBase: 2 };
  }

  const bedsFilter = bedrooms && bedrooms !== "any" ? parseInt(bedrooms, 10) : null;
  const bathsFilter = bathrooms && bathrooms !== "any" ? parseInt(bathrooms, 10) : null;

  const condoNames = [
    "The Meridian", "Park View Towers", "Harbor Landing", "Skyline Residences",
    "The Metropolitan", "Lakeside Commons", "City Walk", "Vista Grande",
    "The Promenade", "Bayshore Terrace", "Heritage Place", "Pacific Heights",
    "Cascade Lofts", "Summit at Main", "Uptown Square", "The Waterford",
    "Crescent Place", "The Wellington", "Mason Creek", "Highland Pointe",
    "The Everett", "Riverwalk Estates", "Centennial Towers", "The Ashford",
  ];

  const schoolNames = ["Lincoln Elementary", "Washington Middle", "Jefferson High", "Roosevelt K-8", "Adams Academy", "Franklin Prep"];

  const listings: RawListing[] = [];

  for (let i = 0; i < 20; i++) {
    const beds = bedsFilter || (rand() < 0.3 ? 1 : rand() < 0.6 ? 2 : 3);
    const baths = bathsFilter || (beds === 1 ? 1 : beds === 2 ? (rand() < 0.5 ? 1 : 2) : 2);

    const bedMultiplier = beds === 1 ? 0.65 : beds === 2 ? 1 : 1.45;
    const variance = 0.7 + rand() * 0.65;
    const price = Math.round(config.basePrice * bedMultiplier * variance / 1000) * 1000;

    if (minPrice && price < minPrice) continue;
    if (maxPrice && price > maxPrice) continue;

    const hoaVariance = 0.5 + rand() * 1.2;
    const hoaFee = Math.round(config.baseHoa * hoaVariance / 5) * 5;

    const hasAssessment = rand() < 0.15;
    const assessmentFee = hasAssessment ? Math.round((50 + rand() * 300) / 5) * 5 : 0;

    const sqftBase = beds === 1 ? 620 : beds === 2 ? 950 : 1300;
    const sqft = Math.round(sqftBase * (0.8 + rand() * 0.5));

    const daysOnMarket = Math.floor(rand() < 0.2 ? 90 + rand() * 120 : rand() * 80);
    const yearBuilt = 1980 + Math.floor(rand() * 44);

    const streetNum = 100 + Math.floor(rand() * 9900);
    const streets = ["Main St", "Oak Ave", "Bay Blvd", "Market St", "Pine Dr", "Harbor Way", "Park Ln", "Elm St", "Cedar Ave", "1st Ave"];
    const unitNum = 100 + Math.floor(rand() * 2900);

    const typeLabels: Record<string, string> = {
      condos: "Condo", condo_townhome: "Condo / Townhome",
      condo_townhome_rowhome_coop: "Condo / Townhome / Rowhome / Co-op",
      townhomes: "Townhome", condop: "Condop", coop: "Co-op",
    };
    const types = propertyTypes && propertyTypes.length > 0 ? propertyTypes : ["condos"];
    const selectedType = types[i % types.length];
    const propertyType = typeLabels[selectedType] || "Condo";

    // Deterministic school ratings
    const schoolRatingVariance = Math.floor(rand() * 4) - 1; // -1 to +2
    const avgSchoolRating = Math.min(10, Math.max(1, config.schoolBase + schoolRatingVariance));
    const schools: SchoolInfo[] = [
      { name: schoolNames[i % 3], rating: Math.min(10, avgSchoolRating + Math.floor(rand() * 2)), level: "elementary", distanceMiles: Math.round(rand() * 15) / 10 + 0.2 },
      { name: schoolNames[(i % 3) + 3], rating: Math.min(10, avgSchoolRating + Math.floor(rand() * 3) - 1), level: "high", distanceMiles: Math.round(rand() * 25) / 10 + 0.5 },
    ];

    // Deterministic flood
    const floodVariance = Math.floor(rand() * 3) - 1;
    const floodFactorScore = Math.min(10, Math.max(1, config.floodBase + floodVariance));
    const femaZone = floodFactorScore <= 2 ? "X (unshaded)" : floodFactorScore <= 5 ? "X (shaded)" : "AE";

    // Deterministic estimate (some above, some below list price)
    const estimateVariance = (rand() - 0.4) * 0.3; // -12% to +18%
    const estimatedValue = Math.round(price * (1 + estimateVariance) / 1000) * 1000;

    // Deterministic price reductions (30% of listings have them)
    const priceReductions: PriceReduction[] = [];
    let originalListPrice: number | null = null;
    if (rand() < 0.3) {
      const numReductions = rand() < 0.6 ? 1 : 2;
      let prevPrice = Math.round(price * (1.05 + rand() * 0.15) / 1000) * 1000;
      originalListPrice = prevPrice;
      for (let r = 0; r < numReductions; r++) {
        const dropPct = 2 + rand() * 6;
        const newPrice = r === numReductions - 1 ? price : Math.round(prevPrice * (1 - dropPct / 100) / 1000) * 1000;
        const dropAmount = prevPrice - newPrice;
        priceReductions.push({
          date: `2026-0${Math.max(1, 3 - numReductions + r)}-${10 + Math.floor(rand() * 18)}`,
          previousPrice: prevPrice,
          newPrice,
          dropAmount,
          dropPercent: Math.round((dropAmount / prevPrice) * 1000) / 10,
        });
        prevPrice = newPrice;
      }
    }

    const stableId = `demo-${locLower}-${i}`;

    listings.push({
      id: stableId,
      address: `${streetNum} ${streets[i % streets.length]} #${unitNum}`,
      city: config.city,
      state: config.state,
      zipCode: config.zip,
      price,
      bedrooms: beds,
      bathrooms: baths,
      sqft,
      hoaFee,
      assessmentFee,
      daysOnMarket,
      yearBuilt,
      listingUrl: null,
      photoUrl: null,
      propertyType,
      source: `Demo Data (${condoNames[i % condoNames.length]})`,
      avgSchoolRating,
      schools,
      floodFactorScore,
      femaZone,
      estimatedValue,
      priceReductions,
      originalListPrice,
    });
  }

  return listings;
}

// Process raw listings into scored results
function processListings(raw: RawListing[], params: SearchParams): SearchResult {
  if (raw.length === 0) {
    return {
      listings: [],
      marketStats: {
        medianPrice: 0, medianHoa: 0, medianPricePerSqft: 0,
        totalListings: 0, avgDaysOnMarket: 0, location: params.location,
      },
      searchParams: params,
    };
  }

  const prices = raw.map((l) => l.price).sort((a, b) => a - b);
  const hoas = raw.filter((l) => l.hoaFee !== null).map((l) => l.hoaFee!).sort((a, b) => a - b);
  const ppsf = raw.filter((l) => l.sqft && l.sqft > 0).map((l) => l.price / l.sqft!).sort((a, b) => a - b);
  const doms = raw.filter((l) => l.daysOnMarket !== null).map((l) => l.daysOnMarket!);

  const median = (arr: number[]) => arr.length === 0 ? 0 : arr[Math.floor(arr.length / 2)];
  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  const stats: MarketStats = {
    medianPrice: median(prices),
    medianHoa: median(hoas),
    medianPricePerSqft: Math.round(median(ppsf)),
    totalListings: raw.length,
    avgDaysOnMarket: Math.round(avg(doms)),
    location: params.location,
  };

  const currentYear = new Date().getFullYear();
  const listings: CondoListing[] = raw.map((r) => {
    const totalMonthlyFees = (r.hoaFee || 0) + (r.assessmentFee || 0);
    const pricePerSqft = r.sqft && r.sqft > 0 ? Math.round(r.price / r.sqft) : null;
    const buildingAge = r.yearBuilt ? currentYear - r.yearBuilt : null;

    // Value gap: negative = priced below estimate (good for buyer)
    const valueGapPercent = r.estimatedValue && r.estimatedValue > 0
      ? Math.round(((r.price - r.estimatedValue) / r.estimatedValue) * 1000) / 10
      : null;

    // Total price reduction
    const totalPriceReduction = r.priceReductions.length > 0
      ? r.priceReductions.reduce((sum, pr) => sum + pr.dropAmount, 0)
      : null;
    const totalReductionPercent = totalPriceReduction !== null && r.originalListPrice
      ? Math.round((totalPriceReduction / r.originalListPrice) * 1000) / 10
      : null;

    const base = {
      ...r,
      totalMonthlyFees,
      pricePerSqft,
      buildingAge,
      valueGapPercent,
      totalPriceReduction,
      totalReductionPercent,
      originalListPrice: r.originalListPrice,
    };

    const scoring = calculateDealScore(base, stats);
    return { ...base, ...scoring };
  });

  // Sort with stable tiebreaker
  const sortBy = params.sortBy || "score";
  listings.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "score": cmp = b.dealScore - a.dealScore; break;
      case "price_low": cmp = a.price - b.price; break;
      case "price_high": cmp = b.price - a.price; break;
      case "hoa_low": cmp = a.totalMonthlyFees - b.totalMonthlyFees; break;
      case "hoa_high": cmp = b.totalMonthlyFees - a.totalMonthlyFees; break;
      default: cmp = b.dealScore - a.dealScore;
    }
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  return { listings, marketStats: stats, searchParams: params };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/config", (req, res) => {
    const { apiKey } = req.body;
    if (apiKey && typeof apiKey === "string") {
      storedApiKey = apiKey;
      res.json({ success: true, message: "API key saved" });
    } else {
      res.status(400).json({ error: "Invalid API key" });
    }
  });

  app.get("/api/config/status", (_req, res) => {
    res.json({ hasApiKey: !!storedApiKey });
  });

  app.post("/api/search", async (req, res) => {
    try {
      const params = searchParamsSchema.parse(req.body);
      const cacheKey = JSON.stringify(params);
      const cached = storage.getCachedSearch(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      let rawListings: RawListing[];

      if (storedApiKey) {
        try {
          rawListings = await fetchFromRealtorAPI(
            storedApiKey, params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        } catch (apiError: any) {
          console.error("API error, falling back to demo data:", apiError.message);
          rawListings = generateDemoListings(
            params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        }
      } else {
        rawListings = generateDemoListings(
          params.location, params.propertyTypes,
          params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
        );
      }

      const result = processListings(rawListings, params);
      storage.cacheSearch(cacheKey, result);
      res.json(result);
    } catch (err: any) {
      console.error("Search error:", err);
      res.status(400).json({ error: err.message || "Search failed" });
    }
  });

  app.post("/api/search/demo", (req, res) => {
    try {
      const params = searchParamsSchema.parse(req.body);
      const rawListings = generateDemoListings(
        params.location, params.propertyTypes,
        params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
      );
      const result = processListings(rawListings, params);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Demo search failed" });
    }
  });

  // CSV Export endpoint
  app.post("/api/export/csv", async (req, res) => {
    try {
      const params = searchParamsSchema.parse(req.body);
      let rawListings: RawListing[];

      if (storedApiKey) {
        try {
          rawListings = await fetchFromRealtorAPI(
            storedApiKey, params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        } catch {
          rawListings = generateDemoListings(
            params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        }
      } else {
        rawListings = generateDemoListings(
          params.location, params.propertyTypes,
          params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
        );
      }

      const result = processListings(rawListings, params);

      const headers = [
        "Score", "Label", "Address", "City", "State", "ZIP",
        "Price", "Beds", "Baths", "Sqft", "Property Type", "Year Built",
        "Days on Market", "Listing URL",
        "HOA Fee", "Assessment Fee", "Total Monthly Fees",
        "Price/Sqft", "Estimated Value", "Value Gap %",
        "School Rating", "Flood Score", "FEMA Zone",
        "Original List Price", "Total Price Reduction", "Reduction %", "# Price Cuts",
      ];

      const csvEscape = (val: any): string => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      const rows = result.listings.map(l => [
        l.dealScore, l.scoreLabel, l.address, l.city, l.state, l.zipCode,
        l.price, l.bedrooms, l.bathrooms, l.sqft, l.propertyType, l.yearBuilt,
        l.daysOnMarket, l.listingUrl || "",
        l.hoaFee, l.assessmentFee, l.totalMonthlyFees,
        l.pricePerSqft, l.estimatedValue, l.valueGapPercent,
        l.avgSchoolRating, l.floodFactorScore, l.femaZone,
        l.originalListPrice, l.totalPriceReduction, l.totalReductionPercent, l.priceReductions.length,
      ]);

      const csv = [headers.map(csvEscape).join(","), ...rows.map(r => r.map(csvEscape).join(","))].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="condoscore-${params.location.replace(/[^a-zA-Z0-9]/g, "_")}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Export failed" });
    }
  });

  // JSON export for Google Sheets integration
  app.post("/api/export/json", async (req, res) => {
    try {
      const params = searchParamsSchema.parse(req.body);
      let rawListings: RawListing[];

      if (storedApiKey) {
        try {
          rawListings = await fetchFromRealtorAPI(
            storedApiKey, params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        } catch {
          rawListings = generateDemoListings(
            params.location, params.propertyTypes,
            params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
          );
        }
      } else {
        rawListings = generateDemoListings(
          params.location, params.propertyTypes,
          params.bedrooms, params.bathrooms, params.minPrice, params.maxPrice
        );
      }

      const result = processListings(rawListings, params);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Export failed" });
    }
  });

  return httpServer;
}
