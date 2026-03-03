import React, { memo, useCallback, useRef, useState, useEffect } from 'react';
import Map, {
    NavigationControl,
    ScaleControl,
    Source,
    Layer,
    type MapRef,
    type ViewStateChangeEvent,
    type LayerProps,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Free tile styles ──
const MAP_STYLES = {
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    darkNoLabels: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
    positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
} as const;

export type MapStyleKey = keyof typeof MAP_STYLES;

// ── Sources ──
const COUNTRIES_GEOJSON_URL = '/data/countries.geo.json';

// ── CARTO boundary highlight layers ──
const HL_LINE = 'boundary-highlight';
const HL_GLOW = 'boundary-highlight-glow';
const HOVER_LINE = 'boundary-hover';

// ── Country name ↔ ISO3 mapping ──
const NAME_TO_ISO3: Record<string, string> = {};
const ISO3_TO_NAME: Record<string, string> = {};
const COUNTRY_DATA: [string, string][] = [
    ['AFG', 'Afghanistan'], ['ALB', 'Albania'], ['DZA', 'Algeria'], ['AND', 'Andorra'], ['AGO', 'Angola'],
    ['ARG', 'Argentina'], ['ARM', 'Armenia'], ['AUS', 'Australia'], ['AUT', 'Austria'], ['AZE', 'Azerbaijan'],
    ['BHS', 'Bahamas'], ['BHR', 'Bahrain'], ['BGD', 'Bangladesh'], ['BRB', 'Barbados'], ['BLR', 'Belarus'],
    ['BEL', 'Belgium'], ['BLZ', 'Belize'], ['BEN', 'Benin'], ['BTN', 'Bhutan'], ['BOL', 'Bolivia'],
    ['BIH', 'Bosnia and Herzegovina'], ['BWA', 'Botswana'], ['BRA', 'Brazil'], ['BRN', 'Brunei'], ['BGR', 'Bulgaria'],
    ['BFA', 'Burkina Faso'], ['BDI', 'Burundi'], ['KHM', 'Cambodia'], ['CMR', 'Cameroon'], ['CAN', 'Canada'],
    ['CAF', 'Central African Republic'], ['TCD', 'Chad'], ['CHL', 'Chile'], ['CHN', 'China'], ['COL', 'Colombia'],
    ['COG', 'Republic of the Congo'], ['COD', 'Democratic Republic of the Congo'],
    ['CRI', 'Costa Rica'], ['HRV', 'Croatia'], ['CUB', 'Cuba'], ['CYP', 'Cyprus'], ['CZE', 'Czechia'],
    ['DNK', 'Denmark'], ['DJI', 'Djibouti'], ['DOM', 'Dominican Republic'], ['ECU', 'Ecuador'], ['EGY', 'Egypt'],
    ['SLV', 'El Salvador'], ['GNQ', 'Equatorial Guinea'], ['ERI', 'Eritrea'], ['EST', 'Estonia'], ['ETH', 'Ethiopia'],
    ['FIN', 'Finland'], ['FRA', 'France'], ['GAB', 'Gabon'], ['GMB', 'Gambia'], ['GEO', 'Georgia'],
    ['DEU', 'Germany'], ['GHA', 'Ghana'], ['GRC', 'Greece'], ['GTM', 'Guatemala'], ['GIN', 'Guinea'],
    ['GNB', 'Guinea-Bissau'], ['GUY', 'Guyana'], ['HTI', 'Haiti'], ['HND', 'Honduras'], ['HUN', 'Hungary'],
    ['ISL', 'Iceland'], ['IND', 'India'], ['IDN', 'Indonesia'], ['IRN', 'Iran'], ['IRQ', 'Iraq'],
    ['IRL', 'Ireland'], ['ISR', 'Israel'], ['ITA', 'Italy'], ['CIV', 'Ivory Coast'], ['JAM', 'Jamaica'],
    ['JPN', 'Japan'], ['JOR', 'Jordan'], ['KAZ', 'Kazakhstan'], ['KEN', 'Kenya'], ['PRK', 'North Korea'],
    ['KOR', 'South Korea'], ['KWT', 'Kuwait'], ['KGZ', 'Kyrgyzstan'], ['LAO', 'Laos'], ['LVA', 'Latvia'],
    ['LBN', 'Lebanon'], ['LSO', 'Lesotho'], ['LBR', 'Liberia'], ['LBY', 'Libya'], ['LTU', 'Lithuania'],
    ['LUX', 'Luxembourg'], ['MKD', 'North Macedonia'], ['MDG', 'Madagascar'], ['MWI', 'Malawi'], ['MYS', 'Malaysia'],
    ['MLI', 'Mali'], ['MRT', 'Mauritania'], ['MEX', 'Mexico'], ['MDA', 'Moldova'], ['MNG', 'Mongolia'],
    ['MNE', 'Montenegro'], ['MAR', 'Morocco'], ['MOZ', 'Mozambique'], ['MMR', 'Myanmar'], ['NAM', 'Namibia'],
    ['NPL', 'Nepal'], ['NLD', 'Netherlands'], ['NZL', 'New Zealand'], ['NIC', 'Nicaragua'], ['NER', 'Niger'],
    ['NGA', 'Nigeria'], ['NOR', 'Norway'], ['OMN', 'Oman'], ['PAK', 'Pakistan'], ['PAN', 'Panama'],
    ['PNG', 'Papua New Guinea'], ['PRY', 'Paraguay'], ['PER', 'Peru'], ['PHL', 'Philippines'], ['POL', 'Poland'],
    ['PRT', 'Portugal'], ['QAT', 'Qatar'], ['ROU', 'Romania'], ['RUS', 'Russia'], ['RWA', 'Rwanda'],
    ['SAU', 'Saudi Arabia'], ['SEN', 'Senegal'], ['SRB', 'Serbia'], ['SLE', 'Sierra Leone'], ['SGP', 'Singapore'],
    ['SVK', 'Slovakia'], ['SVN', 'Slovenia'], ['SOM', 'Somalia'], ['ZAF', 'South Africa'], ['ESP', 'Spain'],
    ['LKA', 'Sri Lanka'], ['SDN', 'Sudan'], ['SSD', 'South Sudan'], ['SUR', 'Suriname'], ['SWZ', 'Eswatini'],
    ['SWE', 'Sweden'], ['CHE', 'Switzerland'], ['SYR', 'Syria'], ['TWN', 'Taiwan'], ['TJK', 'Tajikistan'],
    ['TZA', 'Tanzania'], ['THA', 'Thailand'], ['TLS', 'Timor-Leste'], ['TGO', 'Togo'], ['TTO', 'Trinidad and Tobago'],
    ['TUN', 'Tunisia'], ['TUR', 'Turkey'], ['TKM', 'Turkmenistan'], ['UGA', 'Uganda'], ['UKR', 'Ukraine'],
    ['ARE', 'United Arab Emirates'], ['GBR', 'United Kingdom'], ['USA', 'United States'], ['URY', 'Uruguay'],
    ['UZB', 'Uzbekistan'], ['VEN', 'Venezuela'], ['VNM', 'Vietnam'], ['YEM', 'Yemen'], ['ZMB', 'Zambia'], ['ZWE', 'Zimbabwe'],
    ['PSE', 'Palestine'], ['XKX', 'Kosovo'], ['FLK', 'Falkland Islands'], ['GRL', 'Greenland'],
    ['NCL', 'New Caledonia'], ['PRI', 'Puerto Rico'],
];
for (const [iso, name] of COUNTRY_DATA) {
    NAME_TO_ISO3[name.toLowerCase()] = iso;
    ISO3_TO_NAME[iso] = name;
}
const EXTRA: Record<string, string> = {
    'brasil': 'BRA', 'deutschland': 'DEU', 'españa': 'ESP', 'italia': 'ITA',
    'türkiye': 'TUR', 'россия': 'RUS', 'مصر': 'EGY', 'việt nam': 'VNM',
    'polska': 'POL', 'česko': 'CZE', 'magyarország': 'HUN', 'österreich': 'AUT',
    'schweiz': 'CHE', 'suisse': 'CHE', 'belgique': 'BEL', 'nederland': 'NLD',
    'norge': 'NOR', 'sverige': 'SWE', 'suomi': 'FIN', 'danmark': 'DNK',
    '中国': 'CHN', '日本': 'JPN', '한국': 'KOR', 'भारत': 'IND',
    'україна': 'UKR', 'беларусь': 'BLR',
};
for (const [n, iso] of Object.entries(EXTRA)) NAME_TO_ISO3[n.toLowerCase()] = iso;

function resolveISO3(name: string): string | null {
    const lower = name.toLowerCase().trim();
    if (NAME_TO_ISO3[lower]) return NAME_TO_ISO3[lower];
    for (const [key, iso] of Object.entries(NAME_TO_ISO3)) {
        if (key.includes(lower) || lower.includes(key)) return iso;
    }
    if (ISO3_TO_NAME[name.toUpperCase()]) return name.toUpperCase();
    return null;
}

// ── Layer styles ──

// Invisible click-detection fill
const CLICK_FILL: LayerProps = {
    id: 'countries-click-fill',
    type: 'fill',
    paint: { 'fill-color': 'transparent', 'fill-opacity': 0 },
};

// Hover fill (subtle blue tint)
const HOVER_FILL: LayerProps = {
    id: 'countries-hover-fill',
    type: 'fill',
    paint: {
        'fill-color': 'rgba(100,180,255,0.12)',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
    },
};

// Selected fill (semi-transparent red — covers islands + mainland)
const SELECT_FILL: LayerProps = {
    id: 'countries-select-fill',
    type: 'fill',
    paint: {
        'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], 'rgba(239,68,68,0.15)', 'transparent'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
    },
};

// Selected outline (coastlines + islands — from GeoJSON polygons)
const SELECT_OUTLINE: LayerProps = {
    id: 'countries-select-outline',
    type: 'line',
    paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], 'rgba(239,68,68,0.9)', 'transparent'],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
    },
};

export interface WorldMapProps {
    highlightedRegions?: string[];
    highlightColor?: string;
    onRegionClick?: (regionId: string, regionName: string) => void;
    longitude?: number;
    latitude?: number;
    zoom?: number;
    pitch?: number;
    bearing?: number;
    onCameraChange?: (viewState: {
        longitude: number; latitude: number; zoom: number; pitch: number; bearing: number;
    }) => void;
    mapStyle?: MapStyleKey;
    interactive?: boolean;
    width?: string | number;
    height?: string | number;
    flyTo?: {
        longitude: number; latitude: number; zoom: number;
        pitch?: number; bearing?: number; duration?: number;
    } | null;
}

const WorldMapComponent: React.FC<WorldMapProps> = ({
    highlightedRegions = [],
    highlightColor = '#ef4444',
    onRegionClick,
    longitude = 106,
    latitude = 16,
    zoom = 2,
    pitch = 0,
    bearing = 0,
    onCameraChange,
    mapStyle = 'dark',
    interactive = true,
    width = '100%',
    height = '100%',
    flyTo = null,
}) => {
    const mapRef = useRef<MapRef>(null);
    const [viewState, setViewState] = useState({ longitude, latitude, zoom, pitch, bearing });
    const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [geoData, setGeoData] = useState<any>(null);
    const hoveredIdRef = useRef<number | null>(null);
    const selectedIdsRef = useRef<number[]>([]);

    // Sync props → viewState
    useEffect(() => {
        setViewState(prev => ({ ...prev, longitude, latitude, zoom, pitch, bearing }));
    }, [longitude, latitude, zoom, pitch, bearing]);

    // Fly-to
    useEffect(() => {
        if (flyTo && mapRef.current) {
            mapRef.current.flyTo({
                center: [flyTo.longitude, flyTo.latitude],
                zoom: flyTo.zoom,
                pitch: flyTo.pitch ?? 45,
                bearing: flyTo.bearing ?? 0,
                duration: flyTo.duration ?? 2000,
                essential: true,
            });
        }
    }, [flyTo]);

    // Load GeoJSON for click detection + island fills
    useEffect(() => {
        fetch(COUNTRIES_GEOJSON_URL)
            .then(r => r.json())
            .then(data => {
                if (data?.features) {
                    data.features.forEach((f: any, i: number) => {
                        f.id = i;
                        const a3 = f.properties?.A3 || '';
                        f.properties = { ...f.properties, name: ISO3_TO_NAME[a3] || a3, iso3: a3 };
                    });
                }
                setGeoData(data);
            })
            .catch(err => console.warn('GeoJSON load failed:', err));
    }, []);

    // Add CARTO boundary highlight layers on map load
    const handleLoad = useCallback(() => {
        setMapLoaded(true);
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Hidden initially with impossible filter
        const hidden: any = ['==', 'admin_level', -1];

        if (!map.getLayer(HL_GLOW)) {
            map.addLayer({
                id: HL_GLOW, type: 'line', source: 'carto', 'source-layer': 'boundary',
                filter: hidden,
                paint: { 'line-color': highlightColor, 'line-width': 8, 'line-blur': 5, 'line-opacity': 0.6 },
            });
        }
        if (!map.getLayer(HL_LINE)) {
            map.addLayer({
                id: HL_LINE, type: 'line', source: 'carto', 'source-layer': 'boundary',
                filter: hidden,
                paint: { 'line-color': highlightColor, 'line-width': 3, 'line-opacity': 1 },
            });
        }
        if (!map.getLayer(HOVER_LINE)) {
            map.addLayer({
                id: HOVER_LINE, type: 'line', source: 'carto', 'source-layer': 'boundary',
                filter: hidden,
                paint: { 'line-color': 'rgba(100,180,255,0.8)', 'line-width': 2, 'line-blur': 2, 'line-opacity': 0.7 },
            });
        }
    }, [highlightColor]);

    // ── Update highlights when selection changes ──
    useEffect(() => {
        if (!mapLoaded) return;
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Reset previous GeoJSON selection states
        for (const fid of selectedIdsRef.current) {
            try { map.setFeatureState({ source: 'countries-geojson', id: fid }, { selected: false }); } catch (_) { }
        }
        selectedIdsRef.current = [];

        if (highlightedRegions.length === 0) {
            // Hide CARTO layers
            const hide: any = ['==', 'admin_level', -1];
            if (map.getLayer(HL_LINE)) map.setFilter(HL_LINE, hide);
            if (map.getLayer(HL_GLOW)) map.setFilter(HL_GLOW, hide);
        } else {
            const isoCodes = highlightedRegions
                .map(r => resolveISO3(r))
                .filter((c): c is string => c !== null);

            if (isoCodes.length > 0) {
                // CARTO boundaries: land + maritime borders
                const L: any[] = ['in', 'adm0_l', ...isoCodes];
                const R: any[] = ['in', 'adm0_r', ...isoCodes];
                const filter: any = ['all', ['==', 'admin_level', 2], ['any', L, R]];
                if (map.getLayer(HL_LINE)) {
                    map.setFilter(HL_LINE, filter);
                    map.setPaintProperty(HL_LINE, 'line-color', highlightColor);
                }
                if (map.getLayer(HL_GLOW)) {
                    map.setFilter(HL_GLOW, filter);
                    map.setPaintProperty(HL_GLOW, 'line-color', highlightColor);
                }

                // GeoJSON: mark matching country polygons as selected (covers islands)
                if (geoData?.features) {
                    const ids: number[] = [];
                    for (const f of geoData.features) {
                        const fIso = f.properties?.iso3 || f.properties?.A3 || '';
                        if (isoCodes.includes(fIso) && f.id !== undefined) {
                            try { map.setFeatureState({ source: 'countries-geojson', id: f.id }, { selected: true }); } catch (_) { }
                            ids.push(f.id as number);
                        }
                    }
                    selectedIdsRef.current = ids;
                }
            }
        }
    }, [highlightedRegions, highlightColor, mapLoaded, geoData]);

    const handleMove = useCallback(
        (evt: ViewStateChangeEvent) => {
            setViewState(evt.viewState);
            onCameraChange?.({
                longitude: evt.viewState.longitude,
                latitude: evt.viewState.latitude,
                zoom: evt.viewState.zoom,
                pitch: evt.viewState.pitch,
                bearing: evt.viewState.bearing,
            });
        },
        [onCameraChange]
    );

    // Click: identify from GeoJSON fill
    const handleClick = useCallback(
        (evt: any) => {
            if (!interactive || !onRegionClick) return;
            const map = mapRef.current?.getMap();
            if (!map) return;
            const feats = map.queryRenderedFeatures(evt.point, { layers: ['countries-click-fill'] });
            if (feats.length > 0) {
                const name = feats[0].properties?.name || feats[0].properties?.A3 || '';
                if (name) onRegionClick(name, name);
            }
        },
        [interactive, onRegionClick]
    );

    // Hover: visual feedback (fill + CARTO border)
    const handleMouseMove = useCallback(
        (evt: any) => {
            if (!interactive) return;
            const map = mapRef.current?.getMap();
            if (!map) return;

            const feats = map.queryRenderedFeatures(evt.point, { layers: ['countries-click-fill'] });

            // Clear previous hover
            if (hoveredIdRef.current !== null) {
                try { map.setFeatureState({ source: 'countries-geojson', id: hoveredIdRef.current }, { hover: false }); } catch (_) { }
            }

            if (feats.length > 0) {
                const f = feats[0];
                const name = f.properties?.name || f.properties?.A3 || '';
                const iso = f.properties?.iso3 || resolveISO3(name);
                hoveredIdRef.current = (f.id as number) ?? null;

                if (f.id !== undefined) {
                    try { map.setFeatureState({ source: 'countries-geojson', id: f.id }, { hover: true }); } catch (_) { }
                }

                if (iso && map.getLayer(HOVER_LINE)) {
                    map.setFilter(HOVER_LINE, [
                        'all', ['==', 'admin_level', 2],
                        ['any', ['==', 'adm0_l', iso], ['==', 'adm0_r', iso]],
                    ]);
                }

                setHoveredCountry(name);
                map.getCanvas().style.cursor = 'pointer';
            } else {
                hoveredIdRef.current = null;
                setHoveredCountry(null);
                map.getCanvas().style.cursor = '';
                if (map.getLayer(HOVER_LINE)) map.setFilter(HOVER_LINE, ['==', 'admin_level', -1]);
            }
        },
        [interactive]
    );

    const handleMouseLeave = useCallback(() => {
        setHoveredCountry(null);
        const map = mapRef.current?.getMap();
        if (!map) return;
        if (hoveredIdRef.current !== null) {
            try { map.setFeatureState({ source: 'countries-geojson', id: hoveredIdRef.current }, { hover: false }); } catch (_) { }
            hoveredIdRef.current = null;
        }
        if (map.getLayer(HOVER_LINE)) map.setFilter(HOVER_LINE, ['==', 'admin_level', -1]);
    }, []);

    const styleUrl = MAP_STYLES[mapStyle] || MAP_STYLES.dark;

    return (
        <div style={{ width, height, position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
            <Map
                ref={mapRef}
                {...viewState}
                onMove={handleMove}
                onClick={handleClick}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onLoad={handleLoad}
                mapStyle={styleUrl}
                style={{ width: '100%', height: '100%' }}
                interactive={interactive}
                maxPitch={85}
                attributionControl={false}
                interactiveLayerIds={geoData ? ['countries-click-fill'] : []}
            >
                {interactive && (
                    <>
                        <NavigationControl position="bottom-right" showCompass showZoom />
                        <ScaleControl position="bottom-left" />
                    </>
                )}

                {/* GeoJSON: click detection + selection fill/outline + hover */}
                {geoData && (
                    <Source id="countries-geojson" type="geojson" data={geoData}>
                        <Layer {...CLICK_FILL} />
                        <Layer {...HOVER_FILL} />
                        <Layer {...SELECT_FILL} />
                        <Layer {...SELECT_OUTLINE} />
                    </Source>
                )}
            </Map>

            {/* Info badge */}
            <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10,
                padding: '3px 8px', borderRadius: 6, backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)', pointerEvents: 'none',
            }}>
                🌍 3D Globe · Zoom {viewState.zoom.toFixed(1)}
            </div>

            {(viewState.pitch > 0 || viewState.bearing !== 0) && (
                <div style={{
                    position: 'absolute', top: 30, right: 8,
                    background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)',
                    fontSize: 9, padding: '2px 8px', borderRadius: 4,
                    backdropFilter: 'blur(4px)', fontFamily: 'monospace', pointerEvents: 'none',
                }}>
                    Pitch {viewState.pitch.toFixed(0)}° · Bearing {viewState.bearing.toFixed(0)}°
                </div>
            )}

            {/* Hover tooltip */}
            {hoveredCountry && interactive && (
                <div style={{
                    position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.8)', color: '#fff',
                    fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 8,
                    backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)',
                    pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>
                    📍 {hoveredCountry}
                    {highlightedRegions.includes(hoveredCountry) && (
                        <span style={{ fontSize: 10, color: '#fca5a5', marginLeft: 8 }}>● selected</span>
                    )}
                </div>
            )}

            {/* Selected badge */}
            {highlightedRegions.length > 0 && (
                <div style={{
                    position: 'absolute', top: 8, left: 8,
                    background: `${highlightColor}33`, color: highlightColor,
                    fontSize: 10, padding: '3px 10px', borderRadius: 6,
                    backdropFilter: 'blur(8px)', border: `1px solid ${highlightColor}44`,
                    pointerEvents: 'none',
                }}>
                    📍 {highlightedRegions.length} selected
                </div>
            )}

            {/* Loading */}
            {!geoData && (
                <div style={{
                    position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.7)', color: '#aaa', fontSize: 11,
                    padding: '4px 12px', borderRadius: 6, pointerEvents: 'none',
                }}>
                    ⏳ Loading country data...
                </div>
            )}
        </div>
    );
};

export const WorldMap = memo(WorldMapComponent);
export default WorldMap;
