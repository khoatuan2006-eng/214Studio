/**
 * Registry of country-level admin-1 (province/state) TopoJSON/GeoJSON URLs.
 * Uses Highcharts Map Collection CDN — reliable, consistent, and covers most countries.
 * 
 * Format: country ISO 3166-1 numeric code → { url, name, center, zoom }
 * 
 * To add more countries: https://code.highcharts.com/mapdata/
 * Pattern: https://code.highcharts.com/mapdata/countries/{iso2}/{iso2}-all.topo.json
 */

export interface CountryMapConfig {
    /** ISO 3166-1 Alpha-2 country code */
    iso2: string;
    /** Country name */
    name: string;
    /** Center coordinates [longitude, latitude] for best view */
    center: [number, number];
    /** Default zoom level for this country */
    zoom: number;
    /** Admin-1 TopoJSON URL (provinces/states) */
    topoJsonUrl: string;
    /** Object key inside the TopoJSON (for react-simple-maps Geographies) */
    objectKey?: string;
}

// ISO 3166-1 numeric → CountryMapConfig
// World map uses numeric IDs from Natural Earth
export const COUNTRY_MAP_REGISTRY: Record<string, CountryMapConfig> = {
    // ── Southeast Asia ──
    '704': {
        iso2: 'vn',
        name: 'Vietnam',
        center: [106, 16],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/vn/vn-all.topo.json',
    },
    '764': {
        iso2: 'th',
        name: 'Thailand',
        center: [101, 13],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/th/th-all.topo.json',
    },
    '360': {
        iso2: 'id',
        name: 'Indonesia',
        center: [118, -2],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/id/id-all.topo.json',
    },
    '608': {
        iso2: 'ph',
        name: 'Philippines',
        center: [122, 12],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ph/ph-all.topo.json',
    },
    '458': {
        iso2: 'my',
        name: 'Malaysia',
        center: [109, 4],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/my/my-all.topo.json',
    },

    // ── East Asia ──
    '156': {
        iso2: 'cn',
        name: 'China',
        center: [104, 35],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/cn/cn-all.topo.json',
    },
    '392': {
        iso2: 'jp',
        name: 'Japan',
        center: [138, 36],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/jp/jp-all.topo.json',
    },
    '410': {
        iso2: 'kr',
        name: 'South Korea',
        center: [128, 36],
        zoom: 6,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/kr/kr-all.topo.json',
    },

    // ── North America ──
    '840': {
        iso2: 'us',
        name: 'United States',
        center: [-98, 39],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/us/us-all.topo.json',
    },
    '124': {
        iso2: 'ca',
        name: 'Canada',
        center: [-96, 60],
        zoom: 2,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ca/ca-all.topo.json',
    },
    '484': {
        iso2: 'mx',
        name: 'Mexico',
        center: [-102, 23],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/mx/mx-all.topo.json',
    },

    // ── Europe ──
    '250': {
        iso2: 'fr',
        name: 'France',
        center: [2, 46],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/fr/fr-all.topo.json',
    },
    '276': {
        iso2: 'de',
        name: 'Germany',
        center: [10, 51],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/de/de-all.topo.json',
    },
    '826': {
        iso2: 'gb',
        name: 'United Kingdom',
        center: [-2, 54],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/gb/gb-all.topo.json',
    },
    '380': {
        iso2: 'it',
        name: 'Italy',
        center: [12, 42],
        zoom: 5,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/it/it-all.topo.json',
    },
    '643': {
        iso2: 'ru',
        name: 'Russia',
        center: [100, 60],
        zoom: 2,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ru/ru-all.topo.json',
    },
    '804': {
        iso2: 'ua',
        name: 'Ukraine',
        center: [31, 49],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ua/ua-all.topo.json',
    },

    // ── South America ──
    '076': {
        iso2: 'br',
        name: 'Brazil',
        center: [-53, -14],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/br/br-all.topo.json',
    },

    // ── Middle East / Central Asia ──
    '364': {
        iso2: 'ir',
        name: 'Iran',
        center: [53, 32],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ir/ir-all.topo.json',
    },
    '356': {
        iso2: 'in',
        name: 'India',
        center: [79, 22],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/in/in-all.topo.json',
    },

    // ── Africa ──
    '566': {
        iso2: 'ng',
        name: 'Nigeria',
        center: [8, 10],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/ng/ng-all.topo.json',
    },
    '710': {
        iso2: 'za',
        name: 'South Africa',
        center: [25, -29],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/za/za-all.topo.json',
    },
    '818': {
        iso2: 'eg',
        name: 'Egypt',
        center: [30, 27],
        zoom: 4,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/eg/eg-all.topo.json',
    },

    // ── Oceania ──
    '036': {
        iso2: 'au',
        name: 'Australia',
        center: [134, -25],
        zoom: 3,
        topoJsonUrl: 'https://code.highcharts.com/mapdata/countries/au/au-all.topo.json',
    },
};

/** Check if a country has province-level map data available */
export function hasProvinceData(countryId: string): boolean {
    return countryId in COUNTRY_MAP_REGISTRY;
}

/** Get province map config for a country */
export function getCountryMapConfig(countryId: string): CountryMapConfig | undefined {
    return COUNTRY_MAP_REGISTRY[countryId];
}

/** Get all available countries with province data */
export function getAvailableCountries(): CountryMapConfig[] {
    return Object.values(COUNTRY_MAP_REGISTRY);
}
