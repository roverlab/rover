import React, { useMemo } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import worldData from 'world-atlas/land-110m.json';

// 国家代码到经纬度坐标的映射
const COUNTRY_COORDINATES: Record<string, [number, number]> = {
    // 北美洲
    US: [39.83, -98.58],
    CA: [56.13, -106.35],
    MX: [23.63, -102.55],
    // 南美洲
    BR: [-14.24, -53.19],
    AR: [-38.42, -63.62],
    CL: [-35.68, -71.54],
    CO: [4.57, -74.30],
    PE: [-9.19, -75.02],
    // 欧洲
    GB: [55.38, -3.44],
    DE: [51.17, 10.45],
    FR: [46.23, 2.21],
    NL: [52.13, 5.29],
    RU: [61.52, 105.32],
    UA: [48.38, 31.17],
    PL: [51.92, 19.13],
    IT: [41.87, 12.57],
    ES: [40.46, -3.75],
    CH: [46.82, 8.23],
    SE: [60.13, 18.64],
    NO: [60.47, 8.47],
    FI: [61.92, 25.75],
    DK: [56.26, 9.50],
    AT: [47.52, 14.55],
    PT: [39.40, -8.22],
    IE: [53.41, -8.24],
    BE: [50.50, 4.47],
    CZ: [49.82, 15.47],
    RO: [45.94, 24.97],
    HU: [47.16, 19.50],
    GR: [39.07, 21.82],
    BG: [42.73, 25.49],
    SK: [48.67, 19.70],
    SI: [46.15, 14.99],
    HR: [45.10, 15.20],
    BA: [43.92, 17.68],
    RS: [44.02, 21.01],
    ME: [42.71, 19.37],
    AL: [41.15, 20.17],
    MK: [41.61, 21.75],
    LV: [56.88, 24.60],
    EE: [58.60, 25.01],
    LT: [55.17, 23.88],
    IS: [64.96, -19.02],
    LU: [49.82, 6.13],
    // 非洲
    EG: [26.82, 30.80],
    ZA: [-30.56, 22.94],
    NG: [9.08, 8.68],
    KE: [-0.02, 37.91],
    MA: [31.79, -7.09],
    TN: [33.89, 9.54],
    DZ: [28.03, 1.66],
    GH: [7.95, -1.02],
    ET: [9.15, 40.49],
    TZ: [-6.37, 34.89],
    UG: [1.37, 32.29],
    SN: [14.50, -14.45],
    // 亚洲
    CN: [35.86, 104.19],
    JP: [36.20, 138.25],
    KR: [35.91, 127.77],
    IN: [20.59, 78.96],
    SG: [1.35, 103.82],
    HK: [22.32, 114.17],
    TW: [23.70, 120.96],
    TH: [15.87, 100.99],
    VN: [14.06, 108.28],
    MY: [4.21, 101.98],
    ID: [-0.79, 113.92],
    PH: [12.88, 121.77],
    PK: [30.38, 69.35],
    BD: [23.68, 90.36],
    LK: [7.87, 80.77],
    NP: [28.39, 84.12],
    MM: [21.91, 95.96],
    KH: [12.57, 104.99],
    LA: [19.86, 102.50],
    MN: [46.86, 103.85],
    KZ: [48.02, 66.92],
    UZ: [41.38, 64.59],
    AF: [33.94, 67.71],
    IR: [32.43, 53.69],
    SA: [23.89, 45.08],
    AE: [23.42, 53.85],
    IL: [31.05, 34.85],
    JO: [30.59, 36.24],
    LB: [33.85, 35.86],
    SY: [34.80, 39.00],
    IQ: [33.22, 43.68],
    KW: [29.31, 47.48],
    BH: [26.07, 50.56],
    QA: [25.35, 51.18],
    OM: [21.47, 55.98],
    YE: [15.55, 48.52],
    GE: [42.32, 43.36],
    AM: [40.07, 45.04],
    AZ: [40.14, 47.58],
    TJ: [38.86, 71.28],
    TM: [38.97, 59.56],
    KG: [41.20, 74.77],
    BT: [27.51, 90.43],
    MV: [3.20, 73.22],
    CY: [35.13, 33.43],
    // 大洋洲
    AU: [-25.27, 133.78],
    NZ: [-40.90, 174.89],
    FJ: [-17.71, 178.07],
    PG: [-6.31, 143.96],
};

interface WorldMapProps {
    marker: { countryCode: string; country: string } | null;
}

// 将 TopoJSON 转换为 GeoJSON 特征（只做一次）
const topology = worldData as unknown as Topology;
const land = feature(topology, topology.objects['land'] as any);

// SVG 视图尺寸
const WIDTH = 680;
const HEIGHT = 340;

// 使用 Natural Earth 投影 — 专为世界地图设计的等面积伪圆柱投影，美观且完整
const projection = geoNaturalEarth1()
    .fitSize([WIDTH, HEIGHT], land);
const pathGenerator = geoPath().projection(projection);

// 计算地图实际边界，裁剪掉上下多余空白
const bounds = pathGenerator.bounds(land);
const DX = bounds[1][0] - bounds[0][0];
const DY = bounds[1][1] - bounds[0][1];
const VIEW_X = bounds[0][0];
const VIEW_Y = bounds[0][1];
const VIEW_W = DX;
const VIEW_H = DY;

const WorldMap: React.FC<WorldMapProps> = ({ marker }) => {
    // 计算标记点的投影坐标
    const markerPosition = useMemo(() => {
        if (!marker) return null;
        const coords = COUNTRY_COORDINATES[marker.countryCode];
        if (!coords) return null;
        const projected = projection([coords[1], coords[0]]); // [lng, lat]
        return projected ? { x: projected[0], y: projected[1] } : null;
    }, [marker]);

    return (
        <svg
            viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: 'auto', display: 'block' }}
        >
            {/* 陆地轮廓 */}
            {(land as any).features.map((feature: any, i: number) => {
                const d = pathGenerator(feature);
                if (!d) return null;
                return (
                    <path
                        key={i}
                        d={d}
                        fill="var(--map-land)"
                        stroke="var(--map-stroke)"
                        strokeWidth="0.4"
                        strokeLinejoin="round"
                    />
                );
            })}

            {/* 标记点 */}
            {markerPosition && (
                <g>
                    {/* 脉冲扩散环 */}
                    <circle
                        cx={markerPosition.x}
                        cy={markerPosition.y}
                        r="12"
                        fill="none"
                        stroke="var(--map-marker)"
                        strokeWidth="2.5"
                        opacity="0.6"
                    >
                        <animate attributeName="r" values="12;28;12" dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                    </circle>
                    {/* 核心圆点 - 呼吸缩放 */}
                    <circle
                        cx={markerPosition.x}
                        cy={markerPosition.y}
                        r="12"
                        fill="var(--map-marker)"
                        stroke="var(--map-marker-stroke)"
                        strokeWidth="3"
                    >
                        <animate attributeName="r" values="12;14;12" dur="1s" repeatCount="indefinite" />
                    </circle>
                </g>
            )}
        </svg>
    );
};

export default React.memo(WorldMap);
