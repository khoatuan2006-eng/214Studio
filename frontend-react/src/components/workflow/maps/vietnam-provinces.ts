// ══════════════════════════════════════════════
//  VIETNAM PROVINCES — SVG Path Data
//  63 tỉnh/thành phố with simplified boundaries
//  Coordinate system: viewBox="0 0 1000 1800"
// ══════════════════════════════════════════════

export interface ProvinceData {
    id: string;
    name: string;        // Vietnamese name
    nameEn: string;      // English name
    region: 'north' | 'central' | 'south' | 'highland';
    svgPath: string;     // SVG path data
    centerX: number;     // center for zoom-to
    centerY: number;
}

export const PROVINCES: ProvinceData[] = [
    // ══════════════════════════════════════
    // VÙNG ĐÔNG BẮC (Northeast)
    // ══════════════════════════════════════
    {
        id: 'ha_giang',
        name: 'Hà Giang',
        nameEn: 'Ha Giang',
        region: 'north',
        svgPath: 'M380,20 L420,15 L460,25 L480,50 L470,80 L440,100 L410,95 L380,80 L365,55 Z',
        centerX: 425, centerY: 55,
    },
    {
        id: 'cao_bang',
        name: 'Cao Bằng',
        nameEn: 'Cao Bang',
        region: 'north',
        svgPath: 'M480,25 L530,20 L570,35 L580,65 L560,90 L530,100 L500,85 L480,60 Z',
        centerX: 530, centerY: 58,
    },
    {
        id: 'lao_cai',
        name: 'Lào Cai',
        nameEn: 'Lao Cai',
        region: 'north',
        svgPath: 'M300,40 L340,30 L380,40 L385,75 L365,100 L335,110 L310,95 L295,70 Z',
        centerX: 340, centerY: 70,
    },
    {
        id: 'bac_kan',
        name: 'Bắc Kạn',
        nameEn: 'Bac Kan',
        region: 'north',
        svgPath: 'M440,100 L470,95 L500,110 L505,140 L490,160 L460,165 L440,150 L430,125 Z',
        centerX: 468, centerY: 130,
    },
    {
        id: 'tuyen_quang',
        name: 'Tuyên Quang',
        nameEn: 'Tuyen Quang',
        region: 'north',
        svgPath: 'M365,100 L410,95 L440,115 L445,150 L425,175 L395,180 L370,160 L355,130 Z',
        centerX: 400, centerY: 140,
    },
    {
        id: 'lang_son',
        name: 'Lạng Sơn',
        nameEn: 'Lang Son',
        region: 'north',
        svgPath: 'M530,85 L575,75 L610,95 L615,130 L595,155 L560,160 L535,140 L520,110 Z',
        centerX: 568, centerY: 118,
    },
    {
        id: 'thai_nguyen',
        name: 'Thái Nguyên',
        nameEn: 'Thai Nguyen',
        region: 'north',
        svgPath: 'M450,160 L490,155 L510,175 L510,205 L495,225 L465,225 L445,210 L440,185 Z',
        centerX: 477, centerY: 192,
    },
    {
        id: 'bac_giang',
        name: 'Bắc Giang',
        nameEn: 'Bac Giang',
        region: 'north',
        svgPath: 'M510,155 L555,150 L585,170 L590,200 L570,225 L540,230 L515,215 L505,185 Z',
        centerX: 548, centerY: 190,
    },
    {
        id: 'quang_ninh',
        name: 'Quảng Ninh',
        nameEn: 'Quang Ninh',
        region: 'north',
        svgPath: 'M585,130 L640,115 L690,135 L700,175 L680,210 L640,225 L600,215 L585,185 Z',
        centerX: 640, centerY: 170,
    },

    // ══════════════════════════════════════
    // VÙNG TÂY BẮC (Northwest)
    // ══════════════════════════════════════
    {
        id: 'lai_chau',
        name: 'Lai Châu',
        nameEn: 'Lai Chau',
        region: 'north',
        svgPath: 'M220,50 L270,40 L310,55 L315,95 L290,125 L255,130 L225,110 L210,80 Z',
        centerX: 265, centerY: 85,
    },
    {
        id: 'dien_bien',
        name: 'Điện Biên',
        nameEn: 'Dien Bien',
        region: 'north',
        svgPath: 'M170,90 L220,80 L250,100 L260,140 L245,175 L210,185 L180,165 L160,130 Z',
        centerX: 215, centerY: 135,
    },
    {
        id: 'son_la',
        name: 'Sơn La',
        nameEn: 'Son La',
        region: 'north',
        svgPath: 'M220,140 L290,125 L340,145 L355,185 L340,225 L290,240 L240,225 L215,190 Z',
        centerX: 290, centerY: 182,
    },
    {
        id: 'yen_bai',
        name: 'Yên Bái',
        nameEn: 'Yen Bai',
        region: 'north',
        svgPath: 'M310,100 L365,95 L390,120 L395,155 L375,180 L340,185 L315,165 L300,135 Z',
        centerX: 350, centerY: 140,
    },
    {
        id: 'hoa_binh',
        name: 'Hoà Bình',
        nameEn: 'Hoa Binh',
        region: 'north',
        svgPath: 'M320,230 L370,220 L400,240 L405,275 L385,305 L350,310 L325,290 L310,260 Z',
        centerX: 362, centerY: 268,
    },
    {
        id: 'phu_tho',
        name: 'Phú Thọ',
        nameEn: 'Phu Tho',
        region: 'north',
        svgPath: 'M370,175 L415,168 L440,190 L445,220 L425,245 L395,250 L372,230 L362,205 Z',
        centerX: 405, centerY: 210,
    },

    // ══════════════════════════════════════
    // VÙNG ĐỒNG BẰNG SÔNG HỒNG (Red River Delta)
    // ══════════════════════════════════════
    {
        id: 'vinh_phuc',
        name: 'Vĩnh Phúc',
        nameEn: 'Vinh Phuc',
        region: 'north',
        svgPath: 'M430,220 L465,215 L485,230 L485,250 L470,265 L445,268 L428,253 L425,238 Z',
        centerX: 456, centerY: 242,
    },
    {
        id: 'ha_noi',
        name: 'Hà Nội',
        nameEn: 'Ha Noi',
        region: 'north',
        svgPath: 'M440,260 L490,252 L515,270 L520,305 L505,335 L470,340 L445,320 L432,290 Z',
        centerX: 478, centerY: 298,
    },
    {
        id: 'bac_ninh',
        name: 'Bắc Ninh',
        nameEn: 'Bac Ninh',
        region: 'north',
        svgPath: 'M505,235 L535,228 L555,245 L555,265 L540,278 L515,280 L502,265 L500,248 Z',
        centerX: 528, centerY: 256,
    },
    {
        id: 'hai_duong',
        name: 'Hải Dương',
        nameEn: 'Hai Duong',
        region: 'north',
        svgPath: 'M530,275 L570,268 L595,285 L598,315 L580,335 L550,340 L528,322 L522,298 Z',
        centerX: 560, centerY: 305,
    },
    {
        id: 'hung_yen',
        name: 'Hưng Yên',
        nameEn: 'Hung Yen',
        region: 'north',
        svgPath: 'M498,310 L530,305 L548,320 L548,345 L535,358 L510,360 L495,345 L492,325 Z',
        centerX: 520, centerY: 333,
    },
    {
        id: 'hai_phong',
        name: 'Hải Phòng',
        nameEn: 'Hai Phong',
        region: 'north',
        svgPath: 'M580,290 L630,280 L665,300 L670,335 L650,360 L615,365 L585,345 L573,318 Z',
        centerX: 625, centerY: 325,
    },
    {
        id: 'thai_binh',
        name: 'Thái Bình',
        nameEn: 'Thai Binh',
        region: 'north',
        svgPath: 'M530,345 L575,338 L600,360 L600,390 L580,410 L545,415 L522,395 L518,368 Z',
        centerX: 560, centerY: 378,
    },
    {
        id: 'ha_nam',
        name: 'Hà Nam',
        nameEn: 'Ha Nam',
        region: 'north',
        svgPath: 'M460,335 L498,330 L515,348 L515,375 L498,390 L470,393 L455,375 L450,355 Z',
        centerX: 483, centerY: 362,
    },
    {
        id: 'nam_dinh',
        name: 'Nam Định',
        nameEn: 'Nam Dinh',
        region: 'north',
        svgPath: 'M480,390 L525,385 L548,405 L548,435 L528,455 L495,458 L475,440 L470,412 Z',
        centerX: 510, centerY: 422,
    },
    {
        id: 'ninh_binh',
        name: 'Ninh Bình',
        nameEn: 'Ninh Binh',
        region: 'north',
        svgPath: 'M420,370 L465,362 L485,382 L485,415 L465,438 L435,442 L415,422 L410,395 Z',
        centerX: 448, centerY: 402,
    },

    // ══════════════════════════════════════
    // BẮC TRUNG BỘ (North Central Coast)
    // ══════════════════════════════════════
    {
        id: 'thanh_hoa',
        name: 'Thanh Hoá',
        nameEn: 'Thanh Hoa',
        region: 'central',
        svgPath: 'M340,380 L420,365 L465,395 L470,450 L445,490 L385,500 L340,475 L325,430 Z',
        centerX: 400, centerY: 435,
    },
    {
        id: 'nghe_an',
        name: 'Nghệ An',
        nameEn: 'Nghe An',
        region: 'central',
        svgPath: 'M300,470 L385,450 L435,480 L445,540 L425,585 L365,600 L310,575 L285,525 Z',
        centerX: 370, centerY: 525,
    },
    {
        id: 'ha_tinh',
        name: 'Hà Tĩnh',
        nameEn: 'Ha Tinh',
        region: 'central',
        svgPath: 'M370,590 L425,575 L455,600 L460,645 L440,675 L395,685 L365,660 L355,625 Z',
        centerX: 412, centerY: 635,
    },
    {
        id: 'quang_binh',
        name: 'Quảng Bình',
        nameEn: 'Quang Binh',
        region: 'central',
        svgPath: 'M385,680 L435,665 L465,690 L470,730 L450,760 L410,770 L382,745 L375,715 Z',
        centerX: 425, centerY: 720,
    },
    {
        id: 'quang_tri',
        name: 'Quảng Trị',
        nameEn: 'Quang Tri',
        region: 'central',
        svgPath: 'M395,765 L445,752 L475,775 L478,810 L458,835 L420,842 L398,820 L388,795 Z',
        centerX: 435, centerY: 798,
    },
    {
        id: 'thua_thien_hue',
        name: 'Thừa Thiên Huế',
        nameEn: 'Thua Thien Hue',
        region: 'central',
        svgPath: 'M410,835 L462,822 L495,845 L500,885 L480,915 L440,922 L412,900 L402,868 Z',
        centerX: 452, centerY: 875,
    },

    // ══════════════════════════════════════
    // NAM TRUNG BỘ (South Central Coast)
    // ══════════════════════════════════════
    {
        id: 'da_nang',
        name: 'Đà Nẵng',
        nameEn: 'Da Nang',
        region: 'central',
        svgPath: 'M470,915 L505,908 L525,925 L525,948 L510,960 L480,962 L465,948 L462,932 Z',
        centerX: 495, centerY: 935,
    },
    {
        id: 'quang_nam',
        name: 'Quảng Nam',
        nameEn: 'Quang Nam',
        region: 'central',
        svgPath: 'M430,955 L505,940 L545,965 L550,1010 L525,1045 L468,1055 L430,1025 L418,988 Z',
        centerX: 485, centerY: 998,
    },
    {
        id: 'quang_ngai',
        name: 'Quảng Ngãi',
        nameEn: 'Quang Ngai',
        region: 'central',
        svgPath: 'M460,1048 L520,1035 L555,1060 L560,1100 L540,1130 L490,1140 L458,1115 L448,1080 Z',
        centerX: 510, centerY: 1090,
    },
    {
        id: 'binh_dinh',
        name: 'Bình Định',
        nameEn: 'Binh Dinh',
        region: 'central',
        svgPath: 'M475,1130 L545,1115 L580,1142 L585,1190 L560,1225 L505,1235 L472,1205 L462,1168 Z',
        centerX: 530, centerY: 1175,
    },
    {
        id: 'phu_yen',
        name: 'Phú Yên',
        nameEn: 'Phu Yen',
        region: 'central',
        svgPath: 'M490,1230 L555,1218 L590,1242 L595,1282 L575,1310 L525,1318 L492,1295 L482,1260 Z',
        centerX: 540, centerY: 1268,
    },
    {
        id: 'khanh_hoa',
        name: 'Khánh Hoà',
        nameEn: 'Khanh Hoa',
        region: 'central',
        svgPath: 'M500,1312 L565,1298 L605,1325 L610,1375 L590,1410 L538,1420 L502,1392 L490,1352 Z',
        centerX: 555, centerY: 1360,
    },
    {
        id: 'ninh_thuan',
        name: 'Ninh Thuận',
        nameEn: 'Ninh Thuan',
        region: 'central',
        svgPath: 'M520,1415 L570,1405 L598,1425 L602,1460 L585,1482 L545,1488 L522,1468 L515,1442 Z',
        centerX: 560, centerY: 1448,
    },
    {
        id: 'binh_thuan',
        name: 'Bình Thuận',
        nameEn: 'Binh Thuan',
        region: 'central',
        svgPath: 'M490,1480 L560,1465 L610,1490 L620,1535 L600,1568 L540,1578 L495,1552 L478,1515 Z',
        centerX: 550, centerY: 1525,
    },

    // ══════════════════════════════════════
    // TÂY NGUYÊN (Central Highlands)
    // ══════════════════════════════════════
    {
        id: 'kon_tum',
        name: 'Kon Tum',
        nameEn: 'Kon Tum',
        region: 'highland',
        svgPath: 'M395,1060 L458,1048 L490,1075 L495,1118 L475,1148 L428,1158 L395,1132 L385,1098 Z',
        centerX: 440, centerY: 1105,
    },
    {
        id: 'gia_lai',
        name: 'Gia Lai',
        nameEn: 'Gia Lai',
        region: 'highland',
        svgPath: 'M400,1150 L475,1135 L515,1165 L520,1218 L498,1255 L440,1268 L402,1238 L390,1195 Z',
        centerX: 458, centerY: 1200,
    },
    {
        id: 'dak_lak',
        name: 'Đắk Lắk',
        nameEn: 'Dak Lak',
        region: 'highland',
        svgPath: 'M390,1260 L465,1245 L510,1275 L515,1330 L495,1368 L435,1380 L395,1350 L380,1305 Z',
        centerX: 450, centerY: 1315,
    },
    {
        id: 'dak_nong',
        name: 'Đắk Nông',
        nameEn: 'Dak Nong',
        region: 'highland',
        svgPath: 'M370,1355 L430,1340 L465,1365 L468,1405 L448,1432 L400,1442 L372,1418 L360,1385 Z',
        centerX: 418, centerY: 1392,
    },
    {
        id: 'lam_dong',
        name: 'Lâm Đồng',
        nameEn: 'Lam Dong',
        region: 'highland',
        svgPath: 'M420,1395 L495,1380 L540,1408 L545,1458 L522,1492 L462,1502 L422,1472 L410,1435 Z',
        centerX: 480, centerY: 1442,
    },

    // ══════════════════════════════════════
    // ĐÔNG NAM BỘ (Southeast)
    // ══════════════════════════════════════
    {
        id: 'binh_phuoc',
        name: 'Bình Phước',
        nameEn: 'Binh Phuoc',
        region: 'south',
        svgPath: 'M350,1420 L410,1408 L440,1430 L445,1468 L425,1495 L378,1502 L352,1478 L342,1448 Z',
        centerX: 395, centerY: 1458,
    },
    {
        id: 'tay_ninh',
        name: 'Tây Ninh',
        nameEn: 'Tay Ninh',
        region: 'south',
        svgPath: 'M325,1478 L375,1468 L402,1490 L405,1525 L388,1548 L348,1555 L325,1535 L318,1508 Z',
        centerX: 362, centerY: 1515,
    },
    {
        id: 'binh_duong',
        name: 'Bình Dương',
        nameEn: 'Binh Duong',
        region: 'south',
        svgPath: 'M395,1498 L435,1490 L458,1510 L460,1542 L445,1562 L410,1568 L392,1548 L388,1522 Z',
        centerX: 425, centerY: 1530,
    },
    {
        id: 'dong_nai',
        name: 'Đồng Nai',
        nameEn: 'Dong Nai',
        region: 'south',
        svgPath: 'M440,1470 L510,1455 L550,1485 L555,1535 L535,1568 L478,1578 L442,1550 L432,1510 Z',
        centerX: 495, centerY: 1520,
    },
    {
        id: 'ba_ria_vung_tau',
        name: 'Bà Rịa-Vũng Tàu',
        nameEn: 'Ba Ria-Vung Tau',
        region: 'south',
        svgPath: 'M510,1565 L560,1555 L590,1575 L595,1610 L575,1635 L535,1640 L510,1618 L502,1590 Z',
        centerX: 550, centerY: 1598,
    },
    {
        id: 'ho_chi_minh',
        name: 'TP. Hồ Chí Minh',
        nameEn: 'Ho Chi Minh City',
        region: 'south',
        svgPath: 'M390,1555 L445,1545 L475,1568 L478,1605 L458,1632 L410,1640 L385,1618 L378,1585 Z',
        centerX: 428, centerY: 1592,
    },

    // ══════════════════════════════════════
    // ĐỒNG BẰNG SÔNG CỬU LONG (Mekong Delta)
    // ══════════════════════════════════════
    {
        id: 'long_an',
        name: 'Long An',
        nameEn: 'Long An',
        region: 'south',
        svgPath: 'M340,1600 L395,1590 L425,1612 L428,1648 L408,1672 L362,1678 L338,1658 L330,1628 Z',
        centerX: 380, centerY: 1635,
    },
    {
        id: 'tien_giang',
        name: 'Tiền Giang',
        nameEn: 'Tien Giang',
        region: 'south',
        svgPath: 'M380,1672 L430,1662 L458,1682 L462,1715 L442,1738 L400,1745 L378,1725 L370,1698 Z',
        centerX: 418, centerY: 1705,
    },
    {
        id: 'ben_tre',
        name: 'Bến Tre',
        nameEn: 'Ben Tre',
        region: 'south',
        svgPath: 'M435,1715 L478,1708 L505,1728 L508,1758 L490,1778 L452,1782 L432,1762 L428,1738 Z',
        centerX: 468, centerY: 1748,
    },
    {
        id: 'dong_thap',
        name: 'Đồng Tháp',
        nameEn: 'Dong Thap',
        region: 'south',
        svgPath: 'M308,1655 L365,1645 L392,1668 L395,1708 L375,1735 L328,1742 L302,1718 L295,1685 Z',
        centerX: 348, centerY: 1695,
    },
    {
        id: 'vinh_long',
        name: 'Vĩnh Long',
        nameEn: 'Vinh Long',
        region: 'south',
        svgPath: 'M375,1738 L420,1730 L445,1748 L448,1778 L430,1798 L392,1802 L372,1782 L368,1758 Z',
        centerX: 410, centerY: 1768,
    },
    {
        id: 'tra_vinh',
        name: 'Trà Vinh',
        nameEn: 'Tra Vinh',
        region: 'south',
        svgPath: 'M430,1782 L478,1775 L508,1795 L512,1828 L492,1850 L450,1855 L428,1835 L422,1808 Z',
        centerX: 468, centerY: 1818,
    },
    {
        id: 'an_giang',
        name: 'An Giang',
        nameEn: 'An Giang',
        region: 'south',
        svgPath: 'M270,1690 L325,1680 L352,1705 L355,1742 L335,1768 L288,1775 L262,1752 L255,1720 Z',
        centerX: 308, centerY: 1730,
    },
    {
        id: 'can_tho',
        name: 'Cần Thơ',
        nameEn: 'Can Tho',
        region: 'south',
        svgPath: 'M330,1755 L375,1748 L398,1768 L400,1798 L382,1818 L345,1822 L325,1802 L320,1778 Z',
        centerX: 362, centerY: 1788,
    },
    {
        id: 'hau_giang',
        name: 'Hậu Giang',
        nameEn: 'Hau Giang',
        region: 'south',
        svgPath: 'M340,1820 L388,1812 L415,1832 L418,1862 L398,1882 L355,1888 L332,1868 L328,1842 Z',
        centerX: 375, centerY: 1852,
    },
    {
        id: 'soc_trang',
        name: 'Sóc Trăng',
        nameEn: 'Soc Trang',
        region: 'south',
        svgPath: 'M390,1855 L448,1845 L480,1868 L485,1905 L462,1930 L412,1938 L385,1912 L378,1882 Z',
        centerX: 435, centerY: 1892,
    },
    {
        id: 'kien_giang',
        name: 'Kiên Giang',
        nameEn: 'Kien Giang',
        region: 'south',
        svgPath: 'M220,1740 L285,1725 L318,1755 L322,1810 L300,1855 L245,1868 L210,1835 L200,1790 Z',
        centerX: 265, centerY: 1798,
    },
    {
        id: 'bac_lieu',
        name: 'Bạc Liêu',
        nameEn: 'Bac Lieu',
        region: 'south',
        svgPath: 'M325,1875 L385,1865 L415,1890 L418,1928 L398,1952 L348,1958 L320,1935 L312,1905 Z',
        centerX: 368, centerY: 1915,
    },
    {
        id: 'ca_mau',
        name: 'Cà Mau',
        nameEn: 'Ca Mau',
        region: 'south',
        svgPath: 'M275,1920 L345,1905 L385,1935 L392,1985 L368,2020 L310,2030 L270,2000 L258,1960 Z',
        centerX: 330, centerY: 1968,
    },
];

/** Get province center coordinates for zoom-to feature */
export function getProvinceCenter(id: string): { x: number; y: number } | null {
    const province = PROVINCES.find(p => p.id === id);
    if (!province) return null;
    return { x: province.centerX, y: province.centerY };
}

/** Get all provinces in a region */
export function getProvincesByRegion(region: ProvinceData['region']): ProvinceData[] {
    return PROVINCES.filter(p => p.region === region);
}
