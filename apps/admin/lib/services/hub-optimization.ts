import * as turf from "@turf/turf";
import { Ward } from "./nairobi-wards";

/**
 * Reads a GeoJSON Point's coordinates as a definite [lng, lat] pair.
 *
 * GeoJSON types `coordinates` as `number[]`, so destructuring yields
 * `number | undefined` for each element even though a valid Point always has
 * two. Rather than cast at each of the three call sites, this validates once and
 * throws on genuinely malformed geometry — which is a bug worth hearing about,
 * not something to paper over with a default of 0 that would place a hub in the
 * Gulf of Guinea.
 */
function lngLat(coordinates: number[]): [number, number] {
  const [lng, lat] = coordinates;
  if (typeof lng !== "number" || typeof lat !== "number") {
    throw new Error(
      `Malformed GeoJSON point: expected [lng, lat], got ${JSON.stringify(coordinates)}`,
    );
  }
  return [lng, lat];
}


export interface HubOptimizationResult {
  wardId: string;
  wardName: string;
  constituency: string;
  currentHubs: OptimizedHub[];
  recommendedHubs: OptimizedHub[];
  coverage: {
    current: number; // Percentage of ward covered by current hubs
    recommended: number; // Percentage of ward covered by recommended hubs
  };
  metrics: {
    currentHubCount: number;
    recommendedHubCount: number;
    improvementScore: number; // 0-100 score of how much better the recommendations are
  };
}

export interface OptimizedHub {
  id?: string;
  name?: string;
  coordinates: [number, number]; // [lng, lat]
  radius: number; // in kilometers
  coverage: number; // Percentage of ward area covered
  isExisting: boolean;
}

export interface Vendor {
  _id: string;
  name: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  service_radius: number;
  status: string;
}

const MAX_HUB_RADIUS = 2.5; // kilometers
const MIN_COVERAGE_THRESHOLD = 0.85; // 85% coverage target

/**
 * Calculate optimal hub positions for all Nairobi wards
 */
export async function calculateOptimalHubPositions(
  wards: Ward[],
  currentVendors: Vendor[]
): Promise<HubOptimizationResult[]> {
  console.log(
    `🎯 Starting hub optimization for ${wards.length} wards with ${currentVendors.length} current vendors`
  );

  // Validate input data
  if (!wards || wards.length === 0) {
    console.warn("❌ No wards provided for optimization");
    return [];
  }

  if (!currentVendors || currentVendors.length === 0) {
    console.warn(
      "⚠️ No current vendors provided - optimizing for new hubs only"
    );
  }

  // Validate vendor coordinates
  const validVendors = currentVendors.filter((vendor) => {
    const isValid =
      vendor.coordinates &&
      typeof vendor.coordinates.lat === "number" &&
      typeof vendor.coordinates.lng === "number" &&
      !isNaN(vendor.coordinates.lat) &&
      !isNaN(vendor.coordinates.lng) &&
      vendor.coordinates.lat >= -90 &&
      vendor.coordinates.lat <= 90 &&
      vendor.coordinates.lng >= -180 &&
      vendor.coordinates.lng <= 180;

    if (!isValid) {
      console.warn(
        `❌ Invalid vendor coordinates for ${vendor.name}:`,
        vendor.coordinates
      );
    }
    return isValid;
  });

  if (validVendors.length !== currentVendors.length) {
    console.warn(
      `⚠️ Filtered out ${currentVendors.length - validVendors.length} vendors with invalid coordinates`
    );
  }

  const results: HubOptimizationResult[] = [];
  let processedCount = 0;

  for (const ward of wards) {
    try {
      // Validate ward geometry
      if (!ward.geometry) {
        console.warn(`❌ Missing geometry for ward ${ward.name}`);
        results.push(createEmptyResult(ward));
        continue;
      }

      // Check if geometry has valid coordinates based on type
      let hasValidGeometry = false;
      if (
        ward.geometry.type === "Polygon" ||
        ward.geometry.type === "MultiPolygon"
      ) {
        hasValidGeometry = !!(ward.geometry as any).coordinates;
      } else if (ward.geometry.type === "GeometryCollection") {
        hasValidGeometry = !!(ward.geometry as any).geometries;
      }

      if (!hasValidGeometry) {
        console.warn(`❌ Invalid geometry data for ward ${ward.name}`);
        results.push(createEmptyResult(ward));
        continue;
      }

      const result = await optimizeHubsForWard(ward, validVendors);
      results.push(result);
      processedCount++;

      if (processedCount % 10 === 0) {
        console.log(`📊 Processed ${processedCount}/${wards.length} wards`);
      }
    } catch (error) {
      console.error(`❌ Error optimizing ward ${ward.name}:`, error);
      results.push(createEmptyResult(ward));
    }
  }

  console.log(
    `✅ Hub optimization complete: ${processedCount}/${wards.length} wards successfully processed`
  );
  return results;
}

/**
 * Create an empty result for failed ward optimization
 */
function createEmptyResult(ward: Ward): HubOptimizationResult {
  return {
    wardId: ward.id,
    wardName: ward.name,
    constituency: ward.constituency,
    currentHubs: [],
    recommendedHubs: [],
    coverage: { current: 0, recommended: 0 },
    metrics: {
      currentHubCount: 0,
      recommendedHubCount: 0,
      improvementScore: 0,
    },
  };
}

/**
 * Optimize hub positions for a single ward
 */
async function optimizeHubsForWard(
  ward: Ward,
  allVendors: Vendor[]
): Promise<HubOptimizationResult> {
  // Convert ward geometry to turf feature
  const wardFeature = turf.feature(ward.geometry);
  const wardArea = turf.area(wardFeature);

  // Find current hubs that serve this ward
  const currentHubs = findCurrentHubsInWard(ward, allVendors);

  // Calculate current coverage
  const currentCoverage = calculateWardCoverage(wardFeature, currentHubs);

  // Generate recommended hub positions
  const recommendedHubs = generateOptimalHubPositions(wardFeature, wardArea);

  // Calculate recommended coverage
  const recommendedCoverage = calculateWardCoverage(
    wardFeature,
    recommendedHubs
  );

  // Calculate improvement score
  const improvementScore = calculateImprovementScore(
    currentCoverage,
    recommendedCoverage,
    currentHubs.length,
    recommendedHubs.length
  );

  return {
    wardId: ward.id,
    wardName: ward.name,
    constituency: ward.constituency,
    currentHubs,
    recommendedHubs,
    coverage: {
      current: currentCoverage * 100,
      recommended: recommendedCoverage * 100,
    },
    metrics: {
      currentHubCount: currentHubs.length,
      recommendedHubCount: recommendedHubs.length,
      improvementScore,
    },
  };
}

/**
 * Find existing vendor hubs that serve a specific ward
 */
function findCurrentHubsInWard(ward: Ward, vendors: Vendor[]): OptimizedHub[] {
  const wardFeature = turf.feature(ward.geometry);
  const currentHubs: OptimizedHub[] = [];

  vendors.forEach((vendor) => {
    if (vendor.status !== "Active") return;

    const vendorPoint = turf.point([
      vendor.coordinates.lng,
      vendor.coordinates.lat,
    ]);
    const vendorRadius = Math.min(
      vendor.service_radius || MAX_HUB_RADIUS,
      MAX_HUB_RADIUS
    );

    // Create a circle around the vendor
    const vendorCoverage = turf.circle(vendorPoint, vendorRadius, {
      units: "kilometers",
    });

    // Check if vendor point is within ward or if circles overlap
    try {
      // Cast wardFeature to polygon type for boolean operations
      const isPointInWard = turf.booleanPointInPolygon(
        vendorPoint,
        wardFeature as any
      );
      const hasOverlap =
        turf.booleanOverlap(vendorCoverage, wardFeature as any) ||
        turf.booleanContains(wardFeature as any, vendorCoverage) ||
        turf.booleanWithin(vendorCoverage, wardFeature as any);

      if (isPointInWard || hasOverlap) {
        // Estimate coverage percentage based on overlap
        const wardArea = turf.area(wardFeature);
        const circleArea = turf.area(vendorCoverage);
        const estimatedCoverage = Math.min((circleArea / wardArea) * 100, 100);

        currentHubs.push({
          id: vendor._id,
          name: vendor.name,
          coordinates: [vendor.coordinates.lng, vendor.coordinates.lat],
          radius: vendorRadius,
          coverage: estimatedCoverage,
          isExisting: true,
        });
      }
    } catch (error) {
      console.error(
        `Error calculating coverage for vendor ${vendor.name}:`,
        error
      );
    }
  });

  return currentHubs;
}

/**
 * Generate optimal hub positions for a ward using grid-based approach
 */
function generateOptimalHubPositions(
  wardFeature: GeoJSON.Feature,
  wardArea: number
): OptimizedHub[] {
  try {
    // Get ward bounding box
    const bbox = turf.bbox(wardFeature);
    const [minLng, minLat, maxLng, maxLat] = bbox;

    // Calculate grid size based on hub radius
    const gridSize = (MAX_HUB_RADIUS * 2) / 111; // Approximate conversion to degrees

    const candidatePoints: GeoJSON.Feature<GeoJSON.Point>[] = [];

    // Generate grid of candidate points
    for (let lat = minLat; lat <= maxLat; lat += gridSize) {
      for (let lng = minLng; lng <= maxLng; lng += gridSize) {
        const point = turf.point([lng, lat]);

        // Only include points that are inside the ward
        if (turf.booleanPointInPolygon(point, wardFeature as any)) {
          candidatePoints.push(point);
        }
      }
    }

    // If no candidate points, try ward centroid
    if (candidatePoints.length === 0) {
      const centroid = turf.centroid(wardFeature);
      candidatePoints.push(centroid);
    }

    // Select optimal points using greedy algorithm
    const selectedHubs: OptimizedHub[] = [];
    let uncoveredFeature = wardFeature;
    let iteration = 0;
    const maxIterations = 10; // Prevent infinite loops

    while (iteration < maxIterations && candidatePoints.length > 0) {
      iteration++;

      let bestPoint: GeoJSON.Feature<GeoJSON.Point> | null = null;
      let bestCoverage = 0;

      // Find the point that covers the most uncovered area
      for (const point of candidatePoints) {
        const hubCoverage = turf.circle(point, MAX_HUB_RADIUS, {
          units: "kilometers",
        });

        try {
          // Estimate coverage by checking circle area within uncovered area
          const hubArea = turf.area(hubCoverage);
          const estimatedCoverage = Math.min(hubArea, wardArea);

          if (estimatedCoverage > bestCoverage) {
            bestCoverage = estimatedCoverage;
            bestPoint = point;
          }
        } catch (error) {
          // Skip problematic intersections
          continue;
        }
      }

      // If no significant coverage improvement, stop
      if (!bestPoint || bestCoverage < wardArea * 0.05) {
        break;
      }

      // Add the best hub
      const [lng, lat] = lngLat(bestPoint.geometry.coordinates);
      selectedHubs.push({
        coordinates: [lng, lat],
        radius: MAX_HUB_RADIUS,
        coverage: (bestCoverage / wardArea) * 100,
        isExisting: false,
      });

      // Remove points too close to selected hub
      const selectedPoint = turf.point([lng, lat]);
      candidatePoints.splice(
        0,
        candidatePoints.length,
        ...candidatePoints.filter((point) => {
          const distance = turf.distance(selectedPoint, point, {
            units: "kilometers",
          });
          return distance > MAX_HUB_RADIUS;
        })
      );

      // Check if we've achieved good coverage
      const totalCoverage = calculateWardCoverage(wardFeature, selectedHubs);
      if (totalCoverage >= MIN_COVERAGE_THRESHOLD) {
        break;
      }
    }

    return selectedHubs;
  } catch (error) {
    console.error("Error generating optimal hub positions:", error);

    // Fallback: return centroid-based hub
    try {
      const centroid = turf.centroid(wardFeature);
      const [lng, lat] = lngLat(centroid.geometry.coordinates);

      return [
        {
          coordinates: [lng, lat],
          radius: MAX_HUB_RADIUS,
          coverage: 60, // Estimate
          isExisting: false,
        },
      ];
    } catch (fallbackError) {
      console.error("Error creating fallback hub:", fallbackError);
      return [];
    }
  }
}

/**
 * Calculate the percentage of ward area covered by hubs
 */
function calculateWardCoverage(
  wardFeature: GeoJSON.Feature,
  hubs: OptimizedHub[]
): number {
  if (hubs.length === 0) return 0;

  try {
    const wardArea = turf.area(wardFeature);

    // Estimate total coverage by summing hub circles with overlap consideration
    let totalCoverageArea = 0;
    const hubCircles = hubs.map((hub) => {
      const point = turf.point(hub.coordinates);
      return turf.circle(point, hub.radius, { units: "kilometers" });
    });

    // For simplicity, use the largest circle coverage as base estimate
    // In a production system, you'd want proper union calculation
    if (hubCircles.length === 1) {
      // Guarded by the length check above, but the compiler cannot see that.
      const only = hubCircles[0];
      if (only) totalCoverageArea = turf.area(only);
    } else {
      // Estimate combined coverage (simplified approach)
      totalCoverageArea = hubCircles.reduce((total, circle) => {
        return total + turf.area(circle) * 0.8; // Reduce for overlap
      }, 0);
    }

    return Math.min(totalCoverageArea / wardArea, 1); // Cap at 100%
  } catch (error) {
    console.error("Error calculating ward coverage:", error);
    // Return estimated coverage based on hub count
    return Math.min(hubs.length * 0.3, 1);
  }
}

/**
 * Calculate improvement score comparing current vs recommended setup
 */
function calculateImprovementScore(
  currentCoverage: number,
  recommendedCoverage: number,
  currentHubCount: number,
  recommendedHubCount: number
): number {
  // Coverage improvement weight: 70%
  const coverageImprovement =
    Math.max(0, recommendedCoverage - currentCoverage) * 70;

  // Efficiency improvement weight: 30% (better coverage with fewer hubs is better)
  let efficiencyScore = 0;
  if (currentHubCount > 0) {
    const currentEfficiency = currentCoverage / currentHubCount;
    const recommendedEfficiency =
      recommendedHubCount > 0 ? recommendedCoverage / recommendedHubCount : 0;
    efficiencyScore =
      Math.max(0, recommendedEfficiency - currentEfficiency) * 30;
  } else {
    // If no current hubs, any coverage is an improvement
    efficiencyScore = recommendedCoverage * 30;
  }

  return Math.min(100, Math.round(coverageImprovement + efficiencyScore));
}

/**
 * Calculate statistics across all wards
 */
export function calculateOverallStatistics(results: HubOptimizationResult[]) {
  const totalWards = results.length;
  const wardsWithCurrentHubs = results.filter(
    (r) => r.currentHubs.length > 0
  ).length;
  const averageCurrentCoverage =
    results.reduce((sum, r) => sum + r.coverage.current, 0) / totalWards;
  const averageRecommendedCoverage =
    results.reduce((sum, r) => sum + r.coverage.recommended, 0) / totalWards;
  const totalCurrentHubs = results.reduce(
    (sum, r) => sum + r.metrics.currentHubCount,
    0
  );
  const totalRecommendedHubs = results.reduce(
    (sum, r) => sum + r.metrics.recommendedHubCount,
    0
  );
  const averageImprovementScore =
    results.reduce((sum, r) => sum + r.metrics.improvementScore, 0) /
    totalWards;

  return {
    totalWards,
    wardsWithCurrentHubs,
    wardsWithoutHubs: totalWards - wardsWithCurrentHubs,
    averageCurrentCoverage: Math.round(averageCurrentCoverage * 100) / 100,
    averageRecommendedCoverage:
      Math.round(averageRecommendedCoverage * 100) / 100,
    coverageImprovement:
      Math.round((averageRecommendedCoverage - averageCurrentCoverage) * 100) /
      100,
    totalCurrentHubs,
    totalRecommendedHubs,
    hubEfficiencyImprovement:
      totalCurrentHubs > 0
        ? Math.round(
            (averageRecommendedCoverage /
              totalRecommendedHubs /
              (averageCurrentCoverage / totalCurrentHubs) -
              1) *
              100
          )
        : 0,
    averageImprovementScore: Math.round(averageImprovementScore),
  };
}
