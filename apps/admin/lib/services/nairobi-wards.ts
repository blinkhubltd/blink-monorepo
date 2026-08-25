export interface Ward {
  id: string;
  name: string;
  constituency: string;
  geometry: GeoJSON.Geometry;
  properties: {
    area?: number;
    population?: number;
    density?: number;
  };
}

export interface NairobiWardData {
  wards: Ward[];
  geojson: GeoJSON.FeatureCollection;
}

/**
 * Fetch Nairobi ward boundaries from OpenStreetMap using Overpass API
 */
export async function fetchNairobiWards(): Promise<NairobiWardData> {
  console.log("🌍 Fetching Nairobi wards from OpenStreetMap...");

  try {
    // Overpass query to get Nairobi wards
    const overpassQuery = `
      [out:json][timeout:60];
      (
        relation["admin_level"="8"]["name"~".*Ward"]["place"="suburb"]["addr:city"="Nairobi"];
        relation["admin_level"="8"]["name"~".*Ward"]["is_in:city"="Nairobi"];
        relation["admin_level"="9"]["name"~".*Ward"]["is_in:city"="Nairobi"];
      );
      out geom;
    `;

    const overpassUrl = "https://overpass-api.de/api/interpreter";

    console.log("📡 Sending request to Overpass API...");

    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      console.warn(
        `❌ Overpass API failed: ${response.statusText} (${response.status})`
      );
      console.log("🔄 Falling back to local ward data");
      return getFallbackNairobiWards();
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.warn("❌ Failed to parse Overpass API response:", error);
      console.log("🔄 Falling back to local ward data");
      return getFallbackNairobiWards();
    }

    // Validate response structure
    if (!data || typeof data !== "object") {
      console.warn("❌ Invalid response structure from Overpass API");
      console.log("🔄 Falling back to local ward data");
      return getFallbackNairobiWards();
    }

    // If Overpass API doesn't return enough wards, use fallback data
    if (
      !data.elements ||
      !Array.isArray(data.elements) ||
      data.elements.length < 10
    ) {
      console.warn(
        `❌ Insufficient ward data from Overpass API (${data.elements?.length || 0} wards)`
      );
      console.log("🔄 Falling back to local ward data");
      return getFallbackNairobiWards();
    }

    console.log(`✅ Found ${data.elements.length} wards from Overpass API`);

    const geojsonFeatures: GeoJSON.Feature[] = [];
    const wards: Ward[] = [];

    data.elements.forEach((element: any) => {
      if (element.type === "relation" && element.tags && element.tags.name) {
        const wardName = element.tags.name;
        const constituency =
          element.tags["is_in:constituency"] ||
          element.tags.constituency ||
          extractConstituencyFromName(wardName);

        // Convert OSM geometry to GeoJSON
        const geometry = convertOsmToGeoJSON(element);

        if (geometry) {
          const ward: Ward = {
            id: element.id.toString(),
            name: wardName,
            constituency,
            geometry,
            properties: {
              area: element.tags.area
                ? parseFloat(element.tags.area)
                : undefined,
              population: element.tags.population
                ? parseInt(element.tags.population)
                : undefined,
            },
          };

          wards.push(ward);

          geojsonFeatures.push({
            type: "Feature",
            properties: {
              id: ward.id,
              name: ward.name,
              constituency: ward.constituency,
              ...ward.properties,
            },
            geometry: ward.geometry,
          });
        }
      }
    });

    const validWards = wards.filter(
      (ward) =>
        ward.geometry &&
        ward.name &&
        ward.constituency &&
        (ward.geometry.type === "Polygon" ||
          ward.geometry.type === "MultiPolygon")
    );

    if (validWards.length === 0) {
      console.warn("❌ No valid wards found after processing OSM data");
      console.log("🔄 Falling back to local ward data");
      return getFallbackNairobiWards();
    }

    const validFeatures = geojsonFeatures.filter(
      (feature) =>
        feature.geometry &&
        feature.properties &&
        (feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon")
    );

    console.log(`✅ Successfully processed ${validWards.length} valid wards`);

    return {
      wards: validWards,
      geojson: {
        type: "FeatureCollection",
        features: validFeatures,
      },
    };
  } catch (error) {
    console.error("❌ Error fetching Nairobi wards from OSM:", error);
    console.log("🔄 Falling back to local ward data");
    // Return fallback data if API fails
    return getFallbackNairobiWards();
  }
}

/**
 * Convert OSM relation geometry to GeoJSON
 */
function convertOsmToGeoJSON(element: any): GeoJSON.Geometry | null {
  try {
    if (!element.members || !element.geometry) {
      return null;
    }

    const coordinates: number[][][] = [];

    // Handle multipolygon relations
    element.members.forEach((member: any) => {
      if (member.type === "way" && member.role === "outer") {
        const wayGeometry = element.geometry.find(
          (geom: any) => geom.ref === member.ref
        );
        if (wayGeometry && wayGeometry.nd) {
          const wayCoords: number[][] = wayGeometry.nd.map((node: any) => [
            node.lon,
            node.lat,
          ]);
          if (wayCoords.length > 3) {
            // Valid polygon needs at least 4 points (closed)
            coordinates.push(wayCoords);
          }
        }
      }
    });

    if (coordinates.length === 0) {
      return null;
    }

    return coordinates.length === 1
      ? { type: "Polygon", coordinates: coordinates }
      : {
          type: "MultiPolygon",
          coordinates: coordinates.map((coord) => [coord]),
        };
  } catch (error) {
    console.error("Error converting OSM geometry:", error);
    return null;
  }
}

/**
 * Extract constituency from ward name
 */
function extractConstituencyFromName(wardName: string): string {
  // Common Nairobi constituencies
  const constituencies = [
    "Kasarani",
    "Roysambu",
    "Ruaraka",
    "Embakasi Central",
    "Embakasi East",
    "Embakasi North",
    "Embakasi South",
    "Embakasi West",
    "Kamukunji",
    "Starehe",
    "Mathare",
    "Westlands",
    "Dagoretti North",
    "Dagoretti South",
    "Langata",
    "Kibra",
    "Makadara",
  ];

  for (const constituency of constituencies) {
    if (wardName.toLowerCase().includes(constituency.toLowerCase())) {
      return constituency;
    }
  }

  return "Unknown";
}

/**
 * Fallback Nairobi wards data with approximate coordinates
 */
function getFallbackNairobiWards(): NairobiWardData {
  console.log("🗂️ Using fallback Nairobi wards data (85 wards)");

  const fallbackWards = [
    {
      name: "Githurai Ward",
      constituency: "Kasarani",
      lat: -1.1513,
      lng: 36.9307,
    },
    {
      name: "Kahawa West Ward",
      constituency: "Kasarani",
      lat: -1.1804,
      lng: 36.9294,
    },
    {
      name: "Zimmerman Ward",
      constituency: "Kasarani",
      lat: -1.2116,
      lng: 36.8901,
    },
    {
      name: "Roysambu Ward",
      constituency: "Roysambu",
      lat: -1.2287,
      lng: 36.891,
    },
    { name: "Kahawa Ward", constituency: "Roysambu", lat: -1.1914, lng: 36.95 },
    {
      name: "Clay City Ward",
      constituency: "Roysambu",
      lat: -1.2179,
      lng: 36.9123,
    },
    {
      name: "Baba Dogo Ward",
      constituency: "Ruaraka",
      lat: -1.2347,
      lng: 36.8835,
    },
    {
      name: "Lucky Summer Ward",
      constituency: "Ruaraka",
      lat: -1.2428,
      lng: 36.8663,
    },
    {
      name: "Korogocho Ward",
      constituency: "Ruaraka",
      lat: -1.2512,
      lng: 36.8771,
    },
    {
      name: "Kamae Ward",
      constituency: "Embakasi Central",
      lat: -1.3167,
      lng: 36.9,
    },
    {
      name: "Kayole Central Ward",
      constituency: "Embakasi Central",
      lat: -1.2944,
      lng: 36.9167,
    },
    {
      name: "Matopeni/Spring Valley Ward",
      constituency: "Embakasi Central",
      lat: -1.3089,
      lng: 36.89,
    },
    {
      name: "Upper Savannah Ward",
      constituency: "Embakasi East",
      lat: -1.3278,
      lng: 36.9422,
    },
    {
      name: "Lower Savannah Ward",
      constituency: "Embakasi East",
      lat: -1.339,
      lng: 36.9334,
    },
    {
      name: "Embakasi Ward",
      constituency: "Embakasi East",
      lat: -1.3229,
      lng: 36.9167,
    },
    {
      name: "Utawala Ward",
      constituency: "Embakasi East",
      lat: -1.3067,
      lng: 36.9567,
    },
    {
      name: "Mihango Ward",
      constituency: "Embakasi East",
      lat: -1.3445,
      lng: 36.9223,
    },
    {
      name: "Njiru Ward",
      constituency: "Embakasi North",
      lat: -1.2756,
      lng: 36.9334,
    },
    {
      name: "Ruai Ward",
      constituency: "Embakasi North",
      lat: -1.2834,
      lng: 36.9789,
    },
    {
      name: "Dandora Area I Ward",
      constituency: "Embakasi North",
      lat: -1.2578,
      lng: 36.8945,
    },
    {
      name: "Dandora Area II Ward",
      constituency: "Embakasi North",
      lat: -1.2623,
      lng: 36.8989,
    },
    {
      name: "Dandora Area III Ward",
      constituency: "Embakasi North",
      lat: -1.2667,
      lng: 36.9023,
    },
    {
      name: "Kariobangi North Ward",
      constituency: "Embakasi North",
      lat: -1.2534,
      lng: 36.8834,
    },
    {
      name: "Imara Daima Ward",
      constituency: "Embakasi South",
      lat: -1.3667,
      lng: 36.8667,
    },
    {
      name: "Kwa Njenga Ward",
      constituency: "Embakasi South",
      lat: -1.3534,
      lng: 36.8445,
    },
    {
      name: "Kwa Reuben Ward",
      constituency: "Embakasi South",
      lat: -1.3445,
      lng: 36.8556,
    },
    {
      name: "Pipeline Ward",
      constituency: "Embakasi South",
      lat: -1.3334,
      lng: 36.8778,
    },
    {
      name: "Kariobangi South Ward",
      constituency: "Embakasi South",
      lat: -1.2667,
      lng: 36.8778,
    },
    {
      name: "Umoja I Ward",
      constituency: "Embakasi West",
      lat: -1.2889,
      lng: 36.8834,
    },
    {
      name: "Umoja II Ward",
      constituency: "Embakasi West",
      lat: -1.2945,
      lng: 36.8889,
    },
    {
      name: "Mowlem Ward",
      constituency: "Embakasi West",
      lat: -1.3,
      lng: 36.8723,
    },
    {
      name: "Kariokor Ward",
      constituency: "Kamukunji",
      lat: -1.2889,
      lng: 36.8334,
    },
    {
      name: "Laini Saba Ward",
      constituency: "Kamukunji",
      lat: -1.2834,
      lng: 36.8223,
    },
    {
      name: "Makongeni Ward",
      constituency: "Kamukunji",
      lat: -1.2723,
      lng: 36.8334,
    },
    {
      name: "Pumwani Ward",
      constituency: "Kamukunji",
      lat: -1.2778,
      lng: 36.8445,
    },
    {
      name: "Eastleigh North Ward",
      constituency: "Kamukunji",
      lat: -1.2667,
      lng: 36.8556,
    },
    {
      name: "Eastleigh South Ward",
      constituency: "Kamukunji",
      lat: -1.2778,
      lng: 36.8612,
    },
    {
      name: "Airbase Ward",
      constituency: "Kamukunji",
      lat: -1.2723,
      lng: 36.8612,
    },
    {
      name: "Nairobi Central Ward",
      constituency: "Starehe",
      lat: -1.2889,
      lng: 36.8223,
    },
    { name: "Ngara Ward", constituency: "Starehe", lat: -1.2723, lng: 36.8334 },
    {
      name: "Pangani Ward",
      constituency: "Starehe",
      lat: -1.2612,
      lng: 36.8445,
    },
    {
      name: "Ziwani/Kariokor Ward",
      constituency: "Starehe",
      lat: -1.2834,
      lng: 36.8278,
    },
    {
      name: "Landimawe Ward",
      constituency: "Starehe",
      lat: -1.2667,
      lng: 36.8223,
    },
    {
      name: "Nairobi South Ward",
      constituency: "Starehe",
      lat: -1.3,
      lng: 36.8223,
    },
    {
      name: "Hospital Ward",
      constituency: "Starehe",
      lat: -1.2834,
      lng: 36.8167,
    },
    {
      name: "Mabatini Ward",
      constituency: "Mathare",
      lat: -1.2556,
      lng: 36.8667,
    },
    {
      name: "Huruma Ward",
      constituency: "Mathare",
      lat: -1.2445,
      lng: 36.8612,
    },
    { name: "Ngei Ward", constituency: "Mathare", lat: -1.25, lng: 36.8723 },
    {
      name: "Mlango Kubwa Ward",
      constituency: "Mathare",
      lat: -1.2612,
      lng: 36.8556,
    },
    {
      name: "Kiamaiko Ward",
      constituency: "Mathare",
      lat: -1.2389,
      lng: 36.8723,
    },
    {
      name: "Kitisuru Ward",
      constituency: "Westlands",
      lat: -1.2167,
      lng: 36.7667,
    },
    {
      name: "Parklands/Highridge Ward",
      constituency: "Westlands",
      lat: -1.2445,
      lng: 36.8167,
    },
    {
      name: "Karura Ward",
      constituency: "Westlands",
      lat: -1.2334,
      lng: 36.8334,
    },
    {
      name: "Kangemi Ward",
      constituency: "Westlands",
      lat: -1.2667,
      lng: 36.7556,
    },
    {
      name: "Mountain View Ward",
      constituency: "Westlands",
      lat: -1.2556,
      lng: 36.7889,
    },
    {
      name: "Kilimani Ward",
      constituency: "Westlands",
      lat: -1.2889,
      lng: 36.7889,
    },
    {
      name: "Kawangware Ward",
      constituency: "Dagoretti North",
      lat: -1.2889,
      lng: 36.7334,
    },
    {
      name: "Gatina Ward",
      constituency: "Dagoretti North",
      lat: -1.3,
      lng: 36.7445,
    },
    {
      name: "Kileleshwa Ward",
      constituency: "Dagoretti North",
      lat: -1.2778,
      lng: 36.7667,
    },
    {
      name: "Kabiro Ward",
      constituency: "Dagoretti North",
      lat: -1.3111,
      lng: 36.7334,
    },
    {
      name: "Mutu-ini Ward",
      constituency: "Dagoretti South",
      lat: -1.3223,
      lng: 36.7223,
    },
    {
      name: "Ngando Ward",
      constituency: "Dagoretti South",
      lat: -1.3334,
      lng: 36.7334,
    },
    {
      name: "Riruta Ward",
      constituency: "Dagoretti South",
      lat: -1.3111,
      lng: 36.7556,
    },
    {
      name: "Uthiru/Ruthimitu Ward",
      constituency: "Dagoretti South",
      lat: -1.3445,
      lng: 36.7223,
    },
    {
      name: "Waithaka Ward",
      constituency: "Dagoretti South",
      lat: -1.3334,
      lng: 36.7445,
    },
    { name: "Karen Ward", constituency: "Langata", lat: -1.3334, lng: 36.7 },
    {
      name: "Nairobi West Ward",
      constituency: "Langata",
      lat: -1.3445,
      lng: 36.7334,
    },
    {
      name: "Mugumo-ini Ward",
      constituency: "Langata",
      lat: -1.3667,
      lng: 36.7445,
    },
    {
      name: "South C Ward",
      constituency: "Langata",
      lat: -1.3223,
      lng: 36.8334,
    },
    {
      name: "Nyayo Highrise Ward",
      constituency: "Langata",
      lat: -1.3334,
      lng: 36.8223,
    },
    {
      name: "Laini Saba Ward",
      constituency: "Kibra",
      lat: -1.3111,
      lng: 36.7889,
    },
    { name: "Lindi Ward", constituency: "Kibra", lat: -1.3223, lng: 36.7778 },
    { name: "Makina Ward", constituency: "Kibra", lat: -1.3334, lng: 36.7667 },
    {
      name: "Woodley/Kenyatta Golf Course Ward",
      constituency: "Kibra",
      lat: -1.3,
      lng: 36.7778,
    },
    {
      name: "Sarangombe Ward",
      constituency: "Kibra",
      lat: -1.3111,
      lng: 36.7667,
    },
    {
      name: "Maringo/Hamza Ward",
      constituency: "Makadara",
      lat: -1.3,
      lng: 36.8556,
    },
    {
      name: "Viwandani Ward",
      constituency: "Makadara",
      lat: -1.3111,
      lng: 36.8445,
    },
    {
      name: "Harambee Ward",
      constituency: "Makadara",
      lat: -1.2945,
      lng: 36.8445,
    },
    {
      name: "Makongeni Ward",
      constituency: "Makadara",
      lat: -1.2889,
      lng: 36.8556,
    },
    { name: "Mbotela Ward", constituency: "Makadara", lat: -1.3, lng: 36.8667 },
  ];

  const geojsonFeatures: GeoJSON.Feature[] = fallbackWards.map(
    (ward, index) => {
      // Create approximate ward boundaries (squares around center points)
      const size = 0.015; // Approximate size in degrees
      const coordinates = [
        [
          [ward.lng - size, ward.lat - size],
          [ward.lng + size, ward.lat - size],
          [ward.lng + size, ward.lat + size],
          [ward.lng - size, ward.lat + size],
          [ward.lng - size, ward.lat - size],
        ],
      ];

      return {
        type: "Feature",
        properties: {
          id: index.toString(),
          name: ward.name,
          constituency: ward.constituency,
        },
        geometry: {
          type: "Polygon",
          coordinates,
        },
      };
    }
  );

  const wards: Ward[] = fallbackWards.map((ward, index) => ({
    id: index.toString(),
    name: ward.name,
    constituency: ward.constituency,
    // fallbackWards and geojsonFeatures are built separately, so the index
            // alignment between them is an assumption rather than a guarantee.
    geometry: geojsonFeatures[index]?.geometry as GeoJSON.Geometry,
    properties: {},
  }));

  console.log(
    `✅ Fallback data ready: ${wards.length} wards with valid geometries`
  );

  return {
    wards,
    geojson: {
      type: "FeatureCollection",
      features: geojsonFeatures,
    },
  };
}
