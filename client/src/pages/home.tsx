import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  Search,
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Info,
  Settings,
  BedDouble,
  Bath,
  Ruler,
  Calendar,
  ArrowUpDown,
  ExternalLink,
  Sun,
  Moon,
  ChevronDown,
  ChevronUp,
  MapPin,
  BarChart3,
  Shield,
  GraduationCap,
  Droplets,
  Home as HomeIcon,
  Download,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SearchResult, CondoListing, ScoreBreakdown, SchoolInfo, PriceReduction } from "@shared/schema";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, type PropertyType } from "@shared/schema";

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const colorMap: Record<string, string> = {
    "Great Deal": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    "Good Deal": "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    "Fair": "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    "Overpriced": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    "Avoid": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${colorMap[label] || "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 100;
  const offset = circumference * (1 - pct);

  let color = "hsl(var(--destructive))";
  if (score >= 80) color = "hsl(160, 60%, 36%)";
  else if (score >= 65) color = "hsl(173, 58%, 39%)";
  else if (score >= 45) color = "hsl(38, 92%, 50%)";
  else if (score >= 30) color = "hsl(27, 87%, 55%)";

  return (
    <div className="relative w-[72px] h-[72px] flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
        <circle
          cx="32" cy="32" r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="4"
        />
        <circle
          cx="32" cy="32" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function ScoreBreakdownDetail({ breakdown, totalScore }: { breakdown: ScoreBreakdown; totalScore: number }) {
  const items = [
    { label: "HOA Burden", value: breakdown.hoaBurdenScore, max: 20, desc: "Lower HOA relative to mortgage = better", icon: "🏢" },
    { label: "Price/Sqft", value: breakdown.pricePerSqftScore, max: 15, desc: "Below market median = better", icon: "📐" },
    { label: "Total Cost", value: breakdown.totalCostScore, max: 15, desc: "Monthly cost vs market = better", icon: "💰" },
    { label: "Value Gap", value: breakdown.valueGapScore, max: 15, desc: "Priced below estimated value = better deal", icon: "📊" },
    { label: "School Quality", value: breakdown.schoolQualityScore, max: 10, desc: "Higher school ratings = better", icon: "🎓" },
    { label: "Building Age", value: breakdown.buildingAgeScore, max: 10, desc: "Newer = lower risk of future assessments", icon: "🏗️" },
    { label: "Days on Market", value: breakdown.daysOnMarketScore, max: 5, desc: "Longer = more negotiation room", icon: "⏱️" },
    { label: "Flood Risk", value: breakdown.floodRiskScore, max: 5, desc: "Lower flood factor = better", icon: "💧" },
    { label: "Assessment Risk", value: breakdown.assessmentRiskScore, max: 5, desc: "No special assessments = better", icon: "🛡️" },
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold">Score Breakdown</span>
        <span className="text-xs font-bold text-primary">{totalScore}/100</span>
      </div>
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-muted-foreground">
              <span className="mr-1">{item.icon}</span>{item.label}
            </span>
            <span className="text-xs font-medium">{item.value}/{item.max}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / item.max) * 100}%`,
                backgroundColor: (item.value / item.max) >= 0.7
                  ? "hsl(160, 60%, 36%)"
                  : (item.value / item.max) >= 0.4
                    ? "hsl(38, 92%, 50%)"
                    : "hsl(0, 72%, 51%)",
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
        </div>
      ))}
    </div>
  );
}

function FloodBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  let color = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  let label = "Minimal";
  if (score >= 7) { color = "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"; label = "Severe"; }
  else if (score >= 5) { color = "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"; label = "Moderate"; }
  else if (score >= 3) { color = "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"; label = "Minor"; }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${color}`}>
      <Droplets className="w-3 h-3" />
      Flood: {label} ({score}/10)
    </span>
  );
}

function PriceReductionBadge({ listing }: { listing: CondoListing }) {
  if (!listing.priceReductions || listing.priceReductions.length === 0) return null;
  
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
      <TrendingDown className="w-3 h-3" />
      {listing.priceReductions.length} price cut{listing.priceReductions.length > 1 ? "s" : ""}
      {listing.totalReductionPercent !== null && ` (-${listing.totalReductionPercent}%)`}
    </span>
  );
}

function PriceReductionHistory({ listing }: { listing: CondoListing }) {
  if (!listing.priceReductions || listing.priceReductions.length === 0) return null;

  const fmt = (n: number) => "$" + n.toLocaleString("en-US");

  return (
    <div className="mt-2 pt-2 border-t border-dashed">
      <div className="flex items-center gap-1.5 mb-2">
        <TrendingDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        <span className="text-xs font-semibold">Price Reduction History</span>
      </div>
      <div className="space-y-1.5">
        {listing.originalListPrice && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Original list price</span>
            <span className="font-medium">{fmt(listing.originalListPrice)}</span>
          </div>
        )}
        {listing.priceReductions.map((reduction, i) => (
          <div key={i} className="flex items-center justify-between text-xs pl-3 border-l-2 border-emerald-500/40">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{reduction.date}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                -{fmt(reduction.dropAmount)} ({reduction.dropPercent}%)
              </span>
            </div>
            <span className="font-medium">{fmt(reduction.newPrice)}</span>
          </div>
        ))}
        {listing.totalPriceReduction !== null && listing.totalReductionPercent !== null && (
          <div className="flex items-center justify-between text-xs pt-1 border-t font-semibold">
            <span className="text-emerald-700 dark:text-emerald-300">Total reduced</span>
            <span className="text-emerald-700 dark:text-emerald-300">
              -{fmt(listing.totalPriceReduction)} ({listing.totalReductionPercent}%)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SchoolsList({ schools }: { schools: SchoolInfo[] }) {
  if (!schools || schools.length === 0) return null;

  const levelIcon: Record<string, string> = {
    elementary: "🏫",
    middle: "🏫",
    high: "🎓",
  };

  return (
    <div className="space-y-1">
      {schools.map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex-shrink-0">{levelIcon[s.level] || "🏫"}</span>
            <span className="truncate text-muted-foreground">{s.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {s.rating !== null && (
              <span className={`font-semibold ${s.rating >= 7 ? "text-emerald-600 dark:text-emerald-400" : s.rating >= 5 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                {s.rating}/10
              </span>
            )}
            <span className="text-muted-foreground text-[10px]">{s.distanceMiles.toFixed(1)}mi</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ListingCard({ listing }: { listing: CondoListing }) {
  const [expanded, setExpanded] = useState(false);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const fmtMoney = (n: number) => "$" + fmt(n);

  // Estimated monthly mortgage at 6.5% / 30yr
  const monthlyRate = 0.065 / 12;
  const numPayments = 360;
  const monthlyMortgage = Math.round(
    (listing.price * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1)
  );

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md" data-testid={`card-listing-${listing.id}`}>
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Score section */}
          <div className="flex sm:flex-col items-center justify-center gap-2 p-4 sm:p-5 sm:w-[120px] bg-muted/30 sm:border-r border-b sm:border-b-0">
            <ScoreRing score={listing.dealScore} />
            <ScoreBadge label={listing.scoreLabel} score={listing.dealScore} />
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 sm:p-5">
            <div className="flex flex-col gap-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-tight truncate" data-testid={`text-address-${listing.id}`}>
                    {listing.address}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    {listing.city}, {listing.state} {listing.zipCode}
                    {listing.propertyType && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0 rounded bg-primary/10 text-primary text-[10px] font-medium">
                        {listing.propertyType}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-base" data-testid={`text-price-${listing.id}`}>
                    {fmtMoney(listing.price)}
                  </p>
                  {listing.pricePerSqft && (
                    <p className="text-xs text-muted-foreground">{fmtMoney(listing.pricePerSqft)}/sqft</p>
                  )}
                </div>
              </div>

              {/* Property details row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BedDouble className="w-3.5 h-3.5" /> {listing.bedrooms} bed
                </span>
                <span className="flex items-center gap-1">
                  <Bath className="w-3.5 h-3.5" /> {listing.bathrooms} bath
                </span>
                {listing.sqft && (
                  <span className="flex items-center gap-1">
                    <Ruler className="w-3.5 h-3.5" /> {fmt(listing.sqft)} sqft
                  </span>
                )}
                {listing.yearBuilt && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Built {listing.yearBuilt}{listing.buildingAge !== null ? ` (${listing.buildingAge}yr)` : ""}
                  </span>
                )}
                {listing.daysOnMarket !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {listing.daysOnMarket}d on market
                  </span>
                )}
              </div>

              {/* Badges row: flood risk, value gap, price cuts, school avg */}
              <div className="flex flex-wrap items-center gap-1.5">
                <FloodBadge score={listing.floodFactorScore} />
                {listing.avgSchoolRating !== null && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    listing.avgSchoolRating >= 7 
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" 
                      : listing.avgSchoolRating >= 5 
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                  }`}>
                    <GraduationCap className="w-3 h-3" />
                    Schools: {listing.avgSchoolRating}/10
                  </span>
                )}
                {listing.valueGapPercent !== null && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    listing.valueGapPercent <= -5 
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : listing.valueGapPercent <= 5 
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"
                  }`}>
                    <HomeIcon className="w-3 h-3" />
                    {listing.valueGapPercent <= 0 ? "Below" : "Above"} est. value ({listing.valueGapPercent > 0 ? "+" : ""}{listing.valueGapPercent}%)
                  </span>
                )}
                <PriceReductionBadge listing={listing} />
              </div>

              {/* Fee row */}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">HOA:</span>
                  {listing.hoaFee !== null ? (
                    <span className="text-sm font-semibold">
                      {fmtMoney(listing.hoaFee)}/mo
                    </span>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm font-medium text-muted-foreground/60 cursor-help border-b border-dashed border-muted-foreground/30">
                          Not listed
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[200px] text-xs">
                        HOA fee not available from listing data. Score may be less accurate.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {listing.assessmentFee !== null && listing.assessmentFee > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Assessment:</span>
                    <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      {fmtMoney(listing.assessmentFee)}/mo
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Est. mortgage:</span>
                  <span className="text-sm font-medium">{fmtMoney(monthlyMortgage)}/mo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Total monthly:</span>
                  <span className="text-sm font-bold text-foreground">
                    {fmtMoney(monthlyMortgage + listing.totalMonthlyFees)}/mo
                  </span>
                </div>
                {listing.estimatedValue !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Est. value:</span>
                    <span className="text-sm font-medium">{fmtMoney(listing.estimatedValue)}</span>
                  </div>
                )}
              </div>

              {/* Price reduction history (inline, always visible if present) */}
              <PriceReductionHistory listing={listing} />

              {/* Expand/source row */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid={`button-expand-${listing.id}`}
                >
                  {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {expanded ? "Hide" : "Score"} breakdown{listing.schools && listing.schools.length > 0 ? " & schools" : ""}
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{listing.source}</span>
                  {listing.listingUrl && (
                    <a
                      href={listing.listingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View listing <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {/* Expanded section: score breakdown + schools */}
              {expanded && (
                <div className="pt-2 border-t space-y-4">
                  <ScoreBreakdownDetail breakdown={listing.scoreBreakdown} totalScore={listing.dealScore} />
                  
                  {/* Schools section */}
                  {listing.schools && listing.schools.length > 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-1.5 mb-2">
                        <GraduationCap className="w-3.5 h-3.5 text-primary" />
                        <span className="text-xs font-semibold">Nearby Schools</span>
                      </div>
                      <SchoolsList schools={listing.schools} />
                    </div>
                  )}

                  {/* FEMA zone if present */}
                  {listing.femaZone && (
                    <div className="text-xs text-muted-foreground">
                      FEMA Flood Zone: <span className="font-medium text-foreground">{listing.femaZone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MarketStatsBar({ stats }: { stats: SearchResult["marketStats"] }) {
  const fmt = (n: number) => "$" + n.toLocaleString("en-US");

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {[
        { label: "Median Price", value: fmt(stats.medianPrice), icon: DollarSign },
        { label: "Median HOA", value: stats.medianHoa > 0 ? fmt(stats.medianHoa) + "/mo" : "N/A", icon: Building2 },
        { label: "Median $/sqft", value: stats.medianPricePerSqft > 0 ? fmt(stats.medianPricePerSqft) : "N/A", icon: Ruler },
        { label: "Listings Found", value: String(stats.totalListings), icon: BarChart3 },
        { label: "Avg Days Listed", value: stats.avgDaysOnMarket > 0 ? stats.avgDaysOnMarket + "d" : "N/A", icon: Clock },
      ].map((stat) => (
        <Card key={stat.label} className="border">
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <stat.icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
              <p className="text-sm font-semibold truncate">{stat.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-md" />
      ))}
    </div>
  );
}

export default function Home() {
  const [location, setLocation] = useState("");
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>(["condos"]);
  const [bedrooms, setBedrooms] = useState("any");
  const [bathrooms, setBathrooms] = useState("any");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<string>("score");
  const [apiKey, setApiKey] = useState("");
  const [apiKeySet, setApiKeySet] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [darkMode, setDarkMode] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [configOpen, setConfigOpen] = useState(false);

  // Toggle dark mode
  const toggleDark = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  // Initialize dark mode
  useState(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  });

  // Save API key mutation
  const saveKeyMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", "/api/config", { apiKey: key });
      return res.json();
    },
    onSuccess: () => {
      setApiKeySet(true);
      setConfigOpen(false);
    },
  });

  // Toggle a property type
  const togglePropertyType = (type: PropertyType) => {
    setPropertyTypes((prev) => {
      if (prev.includes(type)) {
        // Don't allow deselecting the last one
        if (prev.length === 1) return prev;
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (params: {
      location: string;
      propertyTypes?: PropertyType[];
      bedrooms?: string;
      bathrooms?: string;
      minPrice?: number;
      maxPrice?: number;
      sortBy?: string;
    }) => {
      const endpoint = apiKeySet ? "/api/search" : "/api/search/demo";
      const res = await apiRequest("POST", endpoint, params);
      return res.json() as Promise<SearchResult>;
    },
    onSuccess: (data) => setResult(data),
  });

  const handleSearch = () => {
    if (!location.trim()) return;
    searchMutation.mutate({
      location: location.trim(),
      propertyTypes,
      bedrooms: bedrooms !== "any" ? bedrooms : undefined,
      bathrooms: bathrooms !== "any" ? bathrooms : undefined,
      minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
      sortBy: sortBy as any,
    });
  };

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort);
    if (result) {
      const sorted = [...result.listings];
      sorted.sort((a, b) => {
        let cmp = 0;
        switch (newSort) {
          case "score": cmp = b.dealScore - a.dealScore; break;
          case "price_low": cmp = a.price - b.price; break;
          case "price_high": cmp = b.price - a.price; break;
          case "hoa_low": cmp = a.totalMonthlyFees - b.totalMonthlyFees; break;
          case "hoa_high": cmp = b.totalMonthlyFees - a.totalMonthlyFees; break;
          default: cmp = b.dealScore - a.dealScore;
        }
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
      });
      setResult({ ...result, listings: sorted });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Building2 className="w-4.5 h-4.5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none">CondoScore</h1>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Deal Analyzer</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="w-8 h-8" data-testid="button-settings">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>API Configuration</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Connect a RapidAPI key to search live listings from Realtor.com.
                    Without a key, the tool uses demo data for any market.
                  </p>
                  <div className="space-y-2">
                    <label className="text-xs font-medium">RapidAPI Key</label>
                    <Input
                      type="password"
                      placeholder="Enter your RapidAPI key..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      data-testid="input-api-key"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Subscribe to the "US Real Estate" API on RapidAPI for live data.
                    </p>
                  </div>
                  <Button
                    onClick={() => saveKeyMutation.mutate(apiKey)}
                    disabled={!apiKey.trim() || saveKeyMutation.isPending}
                    className="w-full"
                    data-testid="button-save-key"
                  >
                    {saveKeyMutation.isPending ? "Saving..." : "Save API Key"}
                  </Button>
                  {apiKeySet && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" /> API key configured — live data enabled
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleDark} data-testid="button-theme">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Search Panel */}
        <Card className="border">
          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* Location row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium mb-1.5 block">Location</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Zip code, city, or area (e.g. 94401, Miami, Chicago)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                    data-testid="input-location"
                  />
                </div>
              </div>
              <div className="flex gap-2 sm:items-end">
                <Button
                  onClick={handleSearch}
                  disabled={!location.trim() || searchMutation.isPending}
                  className="flex-1 sm:flex-none sm:px-8"
                  data-testid="button-search"
                >
                  {searchMutation.isPending ? "Searching..." : "Search"}
                </Button>
              </div>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block">Property Type</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between font-normal h-10 text-sm"
                      data-testid="select-property-type"
                    >
                      <span className="truncate">
                        {propertyTypes.length === 1
                          ? PROPERTY_TYPE_LABELS[propertyTypes[0]]
                          : `${propertyTypes.length} types`}
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0 ml-1" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="start">
                    <div className="space-y-1">
                      {PROPERTY_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                          data-testid={`checkbox-type-${type}`}
                        >
                          <Checkbox
                            checked={propertyTypes.includes(type)}
                            onCheckedChange={() => togglePropertyType(type)}
                          />
                          {PROPERTY_TYPE_LABELS[type]}
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Bedrooms</label>
                <Select value={bedrooms} onValueChange={setBedrooms}>
                  <SelectTrigger data-testid="select-bedrooms">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="0">Studio</SelectItem>
                    <SelectItem value="1">1 Bed</SelectItem>
                    <SelectItem value="2">2 Bed</SelectItem>
                    <SelectItem value="3">3 Bed</SelectItem>
                    <SelectItem value="4">4+ Bed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Bathrooms</label>
                <Select value={bathrooms} onValueChange={setBathrooms}>
                  <SelectTrigger data-testid="select-bathrooms">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="1">1+ Bath</SelectItem>
                    <SelectItem value="2">2+ Bath</SelectItem>
                    <SelectItem value="3">3+ Bath</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Min Price</label>
                <Input
                  type="number"
                  placeholder="$0"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  data-testid="input-min-price"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Max Price</label>
                <Input
                  type="number"
                  placeholder="No max"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  data-testid="input-max-price"
                />
              </div>
            </div>

            {!apiKeySet && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                Using demo data. Add a RapidAPI key in Settings for live listings.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Error */}
        {searchMutation.isError && (
          <Card className="border-destructive/50">
            <CardContent className="p-4 text-sm text-destructive">
              {(searchMutation.error as Error).message || "Search failed. Try again."}
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {searchMutation.isPending && <LoadingSkeleton />}

        {/* Results */}
        {result && !searchMutation.isPending && (
          <div className="space-y-4">
            {/* Market stats */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Market Overview — {result.marketStats.location}
                </h2>
              </div>
              <MarketStatsBar stats={result.marketStats} />
            </div>

            {/* Sort controls + listings */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    {result.listings.length} Properties Found
                  </h2>
                  {result.listings.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs gap-1.5"
                      data-testid="button-export-csv"
                      onClick={async () => {
                        try {
                          const params = {
                            location: location.trim(),
                            propertyTypes,
                            bedrooms: bedrooms !== "any" ? bedrooms : undefined,
                            bathrooms: bathrooms !== "any" ? bathrooms : undefined,
                            minPrice: minPrice ? parseInt(minPrice, 10) : undefined,
                            maxPrice: maxPrice ? parseInt(maxPrice, 10) : undefined,
                            sortBy,
                          };
                          const res = await apiRequest("POST", "/api/export/csv", params);
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `condoscore-${location.trim().replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error("CSV export failed", err);
                        }
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  <Select value={sortBy} onValueChange={handleSortChange}>
                    <SelectTrigger className="w-[160px] h-8 text-xs" data-testid="select-sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Best Deal Score</SelectItem>
                      <SelectItem value="price_low">Price: Low to High</SelectItem>
                      <SelectItem value="price_high">Price: High to Low</SelectItem>
                      <SelectItem value="hoa_low">HOA: Low to High</SelectItem>
                      <SelectItem value="hoa_high">HOA: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {result.listings.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-medium mb-1">No condos found</h3>
                    <p className="text-sm text-muted-foreground">Try adjusting your filters or search a different area.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {result.listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              )}
            </div>

            {/* Scoring methodology */}
            <Card className="border">
              <CardContent className="p-4 sm:p-5">
                <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Scoring Methodology (100 points)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">HOA Burden (20 pts):</span> HOA fees as a percentage of estimated mortgage payment. Lower is better.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Price/Sqft (15 pts):</span> Compared to the market median price per square foot.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Total Cost (15 pts):</span> All-in monthly cost (mortgage + HOA) vs market average.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Value Gap (15 pts):</span> List price vs independent appraisal estimates. Below value = better deal.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">School Quality (10 pts):</span> Average GreatSchools rating of nearby assigned schools.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Building Age (10 pts):</span> Newer buildings have lower risk of costly future special assessments.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Days on Market (5 pts):</span> Longer listings may have more negotiation room.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Flood Risk (5 pts):</span> FloodFactor score from 1-10. Lower flood risk = better.
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Assessment Risk (5 pts):</span> Special assessments increase ownership cost and risk.
                  </div>
                  <div className="sm:col-span-3 pt-1 border-t mt-1">
                    <span className="font-medium text-foreground">Mortgage estimate:</span> Based on 6.5% APR, 30-year fixed, no down payment. Price reductions shown are from listing history.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {!result && !searchMutation.isPending && !searchMutation.isError && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Search Properties</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
              Enter a zip code, city, or area to find actively listed condos, townhomes, co-ops, and more.
              Each listing is scored across 9 dimensions including HOA burden, schools, flood risk, value gap, and price history.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["94401", "Miami", "Chicago", "Seattle", "Austin"].map((q) => (
                <Button
                  key={q}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setLocation(q);
                    searchMutation.mutate({ location: q, propertyTypes, sortBy: "score" });
                  }}
                  data-testid={`button-quicksearch-${q}`}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="pt-6 pb-4 border-t text-center">
          <PerplexityAttribution />
        </footer>
      </main>
    </div>
  );
}
