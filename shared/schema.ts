import { z } from "zod";

// Property type enum values supported by the Realty in US API
export const PROPERTY_TYPES = [
  "condos",
  "condo_townhome",
  "condo_townhome_rowhome_coop",
  "townhomes",
  "condop",
  "coop",
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];

// Human-readable labels for each property type
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  condos: "Condos",
  condo_townhome: "Condo / Townhome",
  condo_townhome_rowhome_coop: "Condo / Townhome / Rowhome / Co-op",
  townhomes: "Townhomes",
  condop: "Condop",
  coop: "Co-op",
};

// Search parameters schema
export const searchParamsSchema = z.object({
  location: z.string().min(1, "Location is required"),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).optional().default(["condos"]),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  sortBy: z.enum(["score", "price_low", "price_high", "hoa_low", "hoa_high"]).optional().default("score"),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;

// Price reduction event
export interface PriceReduction {
  date: string;            // ISO date string
  previousPrice: number;
  newPrice: number;
  dropAmount: number;      // positive number
  dropPercent: number;     // e.g. 4.7 means 4.7%
}

// School info for display
export interface SchoolInfo {
  name: string;
  rating: number | null;      // 1-10 GreatSchools rating
  level: string;              // "elementary" | "middle" | "high"
  distanceMiles: number;
}

// Condo listing type
export interface CondoListing {
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
  totalMonthlyFees: number;
  pricePerSqft: number | null;
  daysOnMarket: number | null;
  yearBuilt: number | null;
  buildingAge: number | null;           // Computed server-side for deterministic display
  listingUrl: string | null;
  photoUrl: string | null;
  propertyType: string;
  source: string;
  // Location & environment
  avgSchoolRating: number | null;       // Average GreatSchools rating of assigned schools (1-10)
  schools: SchoolInfo[];                // Nearby rated schools for display
  floodFactorScore: number | null;      // 1-10 (1=minimal, 10=extreme)
  femaZone: string | null;             // FEMA flood zone code
  // Value analysis
  estimatedValue: number | null;        // Average of independent appraisals
  valueGapPercent: number | null;       // (listPrice - estimatedValue) / estimatedValue * 100 (negative = below value)
  // Price reduction history
  priceReductions: PriceReduction[];    // Chronological price drops
  totalPriceReduction: number | null;   // Total $ reduced from original list
  totalReductionPercent: number | null; // Total % reduced from original list
  originalListPrice: number | null;     // First listed price
  // Scoring
  dealScore: number;
  scoreBreakdown: ScoreBreakdown;
  scoreLabel: "Great Deal" | "Good Deal" | "Fair" | "Overpriced" | "Avoid";
}

export interface ScoreBreakdown {
  hoaBurdenScore: number;       // 0-20 pts: HOA as % of monthly payment
  pricePerSqftScore: number;    // 0-15 pts: vs market average
  totalCostScore: number;       // 0-15 pts: total monthly cost competitiveness
  buildingAgeScore: number;     // 0-10 pts: newer = less assessment risk
  daysOnMarketScore: number;    // 0-5 pts: lingering = possible negotiation
  assessmentRiskScore: number;  // 0-5 pts: no/low assessments = better
  schoolQualityScore: number;   // 0-10 pts: higher school ratings = better
  floodRiskScore: number;       // 0-5 pts: lower flood risk = better
  valueGapScore: number;        // 0-15 pts: priced below estimated value = better
}

export interface MarketStats {
  medianPrice: number;
  medianHoa: number;
  medianPricePerSqft: number;
  totalListings: number;
  avgDaysOnMarket: number;
  location: string;
}

export interface SearchResult {
  listings: CondoListing[];
  marketStats: MarketStats;
  searchParams: SearchParams;
}

// API config
export const apiConfigSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  provider: z.enum(["rapidapi_realtor", "rentcast"]).default("rapidapi_realtor"),
});

export type ApiConfig = z.infer<typeof apiConfigSchema>;
