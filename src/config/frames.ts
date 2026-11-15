import type { AppLanguage } from './preferences';

export const FRAME_CATEGORIES = {
    solid: '纯色经典',
    gradient: '梦幻渐变',
    pattern: '几何复古',
    anime: '动漫二次元',
    texture: '材质肌理',
    diy: '手账与做旧',
} as const;

export const FRAME_CATEGORIES_EN: Record<keyof typeof FRAME_CATEGORIES, string> = {
    solid: 'Solid Classic',
    gradient: 'Dreamy Gradient',
    pattern: 'Retro Pattern',
    anime: 'Anime & Pop',
    texture: 'Paper & Texture',
    diy: 'Collage & DIY',
};

export type FrameCategory = keyof typeof FRAME_CATEGORIES;

export function frameCategoryLabel(category: FrameCategory, lang: AppLanguage = 'zh'): string {
    return lang === 'en' ? FRAME_CATEGORIES_EN[category] : FRAME_CATEGORIES[category];
}

export type FrameStyleId =
    | 'classic-ivory'
    | 'darkroom-black'
    | 'sakura-pink'
    | 'mint-soda'
    | 'buttercream-yellow'
    | 'mist-blue'
    | 'sunset-glow'
    | 'y2k-aura'
    | 'cyber-neon'
    | 'matcha-latte'
    | 'retro-checkerboard'
    | 'pop-polka'
    | 'candy-stripes'
    | 'indigo-denim'
    | 'manga-screentone'
    | 'action-speedlines'
    | 'pixel-rpg'
    | 'magical-starlight'
    | 'vaporwave-window'
    | 'kraft-paper'
    | 'metallic-silver'
    | 'film-strip'
    | 'crumpled-washi'
    | 'washi-tape'
    | 'airmail-postcard'
    | 'gothic-thorn'
    | 'stacked-double';

export interface FrameStyle {
    id: FrameStyleId;
    code: string;
    name: string;
    nameEn: string;
    category: FrameCategory;
    description: string;
    descriptionEn: string;
    /** CSS background used for mini card previews in the picker */
    previewBackground: string;
    /** CSS color for text on the mini card preview */
    previewTextColor: string;
    /** Optional CSS border/outline on the inner photo box of the mini preview */
    previewInnerBorder?: string;
}

export function frameStyleName(style: FrameStyle, lang: AppLanguage = 'zh'): string {
    return lang === 'en' ? style.nameEn : style.name;
}

export function frameStyleDescription(style: FrameStyle, lang: AppLanguage = 'zh'): string {
    return lang === 'en' ? style.descriptionEn : style.description;
}

export const FRAME_STYLES: readonly FrameStyle[] = [
    // 1. 纯色经典 (1, 2, 3, 4, 5, 6)
    {
        id: 'classic-ivory',
        code: '#01',
        name: '经典象牙白',
        nameEn: 'Classic Ivory',
        category: 'solid',
        description: '微暖米白相纸光泽与经典留白',
        descriptionEn: 'Warm ivory photo paper with timeless Polaroid margins',
        previewBackground: 'linear-gradient(165deg, #faf6ef 0%, #f1e9dc 100%)',
        previewTextColor: '#55514c',
        previewInnerBorder: '1px solid rgba(85, 81, 76, 0.16)',
    },
    {
        id: 'darkroom-black',
        code: '#02',
        name: '暗房纯黑',
        nameEn: 'Darkroom Black',
        category: 'solid',
        description: '哑光炭黑外框，衬托浓郁画面色彩',
        descriptionEn: 'Matte charcoal black border that makes colors pop',
        previewBackground: 'linear-gradient(165deg, #1c1d21 0%, #101114 100%)',
        previewTextColor: '#d4d4d8',
        previewInnerBorder: '1px solid #3f3f46',
    },
    {
        id: 'sakura-pink',
        code: '#03',
        name: '樱花奶粉',
        nameEn: 'Sakura Blush',
        category: 'solid',
        description: '柔和低饱和浅粉边框，甜美日常感',
        descriptionEn: 'Soft pastel sakura pink with delicate petal accents',
        previewBackground: 'linear-gradient(165deg, #fce7f3 0%, #fbcfe8 100%)',
        previewTextColor: '#9d174d',
        previewInnerBorder: '1px solid rgba(157, 23, 77, 0.2)',
    },
    {
        id: 'mint-soda',
        code: '#04',
        name: '薄荷苏打',
        nameEn: 'Mint Soda',
        category: 'solid',
        description: '清新薄荷浅绿边框，夏日森系感',
        descriptionEn: 'Refreshing mint green with fizzy summer bubble rings',
        previewBackground: 'linear-gradient(165deg, #dcfce7 0%, #bbf7d0 100%)',
        previewTextColor: '#065f46',
        previewInnerBorder: '1px solid rgba(6, 95, 70, 0.2)',
    },
    {
        id: 'buttercream-yellow',
        code: '#05',
        name: '奶油鹅黄',
        nameEn: 'Buttercream',
        category: 'solid',
        description: '温暖治愈淡奶黄，午后复古胶片感',
        descriptionEn: 'Cozy warm buttercream yellow for sunny afternoon vibes',
        previewBackground: 'linear-gradient(165deg, #fef9c3 0%, #fde68a 100%)',
        previewTextColor: '#92400e',
        previewInnerBorder: '1px solid rgba(146, 64, 14, 0.2)',
    },
    {
        id: 'mist-blue',
        code: '#06',
        name: '雾霾冰蓝',
        nameEn: 'Mist Ice Blue',
        category: 'solid',
        description: '清冷呼吸感浅蓝，适合天空与校园风',
        descriptionEn: 'Airy ice-blue frame ideal for sky, sea, and campus shots',
        previewBackground: 'linear-gradient(165deg, #e0f2fe 0%, #bae6fd 100%)',
        previewTextColor: '#075985',
        previewInnerBorder: '1px solid rgba(7, 89, 133, 0.2)',
    },

    // 2. 梦幻渐变 (7, 8, 11, 12)
    {
        id: 'sunset-glow',
        code: '#07',
        name: '落日橘粉',
        nameEn: 'Sunset Glow',
        category: 'gradient',
        description: '珊瑚橘到蜜桃粉的温暖斜向渐变',
        descriptionEn: 'Warm diagonal gradient from peach pink to golden sunset',
        previewBackground: 'linear-gradient(135deg, #fda4af 0%, #fdba74 65%, #fde047 100%)',
        previewTextColor: '#7c2d12',
        previewInnerBorder: '1px solid rgba(255, 255, 255, 0.6)',
    },
    {
        id: 'y2k-aura',
        code: '#08',
        name: '千禧极光',
        nameEn: 'Y2K Aura',
        category: 'gradient',
        description: '电光紫、冰蓝与霓虹粉流体弥散渐变',
        descriptionEn: 'Iridescent violet, ice blue, and neon pink aura blend',
        previewBackground: 'linear-gradient(135deg, #c084fc 0%, #60a5fa 50%, #f472b6 100%)',
        previewTextColor: '#ffffff',
        previewInnerBorder: '1px solid rgba(255, 255, 255, 0.75)',
    },
    {
        id: 'cyber-neon',
        code: '#11',
        name: '赛博霓虹',
        nameEn: 'Cyber Neon',
        category: 'gradient',
        description: '暗夜深蓝底配青品红双色霓虹发光框',
        descriptionEn: 'Midnight cyber grid with cyan and magenta neon brackets',
        previewBackground: 'linear-gradient(160deg, #090d16 0%, #161b2e 100%)',
        previewTextColor: '#22d3ee',
        previewInnerBorder: '1.5px solid #22d3ee',
    },
    {
        id: 'matcha-latte',
        code: '#12',
        name: '抹茶拿铁',
        nameEn: 'Matcha Latte',
        category: 'gradient',
        description: '宇治绿向奶霜白的柔和纵向渐变',
        descriptionEn: 'Smooth vertical blend of Uji matcha green and milk foam',
        previewBackground: 'linear-gradient(180deg, #bbf7d0 0%, #fefce8 100%)',
        previewTextColor: '#14532d',
        previewInnerBorder: '1px solid rgba(20, 83, 45, 0.2)',
    },

    // 3. 几何复古 (13, 15, 16, 17)
    {
        id: 'retro-checkerboard',
        code: '#13',
        name: '复古棋盘格',
        nameEn: 'Checkerboard',
        category: 'pattern',
        description: '经典奶白与炭黑交错小棋盘格',
        descriptionEn: 'Classic cream and charcoal checkerboard pattern',
        previewBackground:
            'repeating-conic-gradient(#262626 0% 25%, #f5f2eb 0% 50%) 0 0 / 12px 12px',
        previewTextColor: '#171717',
        previewInnerBorder: '1.5px solid #171717',
    },
    {
        id: 'pop-polka',
        code: '#15',
        name: '波普圆点',
        nameEn: 'Pop Polka Dots',
        category: 'pattern',
        description: '米白底彩色波尔卡圆点，活泼元气风',
        descriptionEn: 'Playful pink and blue polka dots on warm cream paper',
        previewBackground:
            'radial-gradient(#f472b6 2px, transparent 2px) 0 0 / 12px 12px, radial-gradient(#60a5fa 2px, #fffdf9 2px) 6px 6px / 12px 12px',
        previewTextColor: '#9d174d',
        previewInnerBorder: '1px solid #f472b6',
    },
    {
        id: 'candy-stripes',
        code: '#16',
        name: '糖果斜条纹',
        nameEn: 'Candy Stripes',
        category: 'pattern',
        description: '粉白相间 45° 斜条纹，游乐园甜酷感',
        descriptionEn: 'Sweet 45° pink and white diagonal carnival stripes',
        previewBackground:
            'repeating-linear-gradient(45deg, #fce7f3, #fce7f3 6px, #fbcfe8 6px, #fbcfe8 12px)',
        previewTextColor: '#9d174d',
        previewInnerBorder: '1.5px solid #ffffff',
    },
    {
        id: 'indigo-denim',
        code: '#17',
        name: '蓝调丹宁',
        nameEn: 'Indigo Denim',
        category: 'pattern',
        description: '水洗牛仔布斜纹肌理配橙黄车缝虚线',
        descriptionEn: 'Washed indigo twill texture with golden stitched seams',
        previewBackground:
            'repeating-linear-gradient(-45deg, #1e3a5f, #1e3a5f 2px, #26466f 2px, #26466f 4px)',
        previewTextColor: '#fde68a',
        previewInnerBorder: '1.5px dashed #f59e0b',
    },

    // 4. 动漫二次元 (19, 20, 21, 22, 23)
    {
        id: 'manga-screentone',
        code: '#19',
        name: '漫画网点纸',
        nameEn: 'Manga Screentone',
        category: 'anime',
        description: '黑白漫画网点纹理与粗黑手绘漫画内框',
        descriptionEn: 'Monochrome halftone dots with bold comic ink borders',
        previewBackground: 'radial-gradient(#111 1.2px, #ffffff 1.2px) 0 0 / 5px 5px',
        previewTextColor: '#111111',
        previewInnerBorder: '2px solid #111111',
    },
    {
        id: 'action-speedlines',
        code: '#20',
        name: '热血集中线',
        nameEn: 'Action Speedlines',
        category: 'anime',
        description: '向中心汇聚的漫画速度线与爆点字框',
        descriptionEn: 'Dynamic manga focus lines radiating from the frame',
        previewBackground:
            'repeating-conic-gradient(from 0deg, #ffffff 0deg 6deg, #1f2937 6deg 6.8deg, #ffffff 6.8deg 13deg)',
        previewTextColor: '#111111',
        previewInnerBorder: '2px solid #111111',
    },
    {
        id: 'pixel-rpg',
        code: '#21',
        name: '复古像素风',
        nameEn: '8-Bit Pixel RPG',
        category: 'anime',
        description: '8-Bit 像素金框与 RPG 状态栏装饰',
        descriptionEn: '8-bit gold dialog border with retro RPG heart status bar',
        previewBackground: 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
        previewTextColor: '#fef08a',
        previewInnerBorder: '2px solid #fbbf24',
    },
    {
        id: 'magical-starlight',
        code: '#22',
        name: '魔法少女星芒',
        nameEn: 'Magical Starlight',
        category: 'anime',
        description: '星夜紫蓝底配金色十字星芒与魔法细框',
        descriptionEn: 'Starry velvet night adorned with golden four-point stars',
        previewBackground: 'radial-gradient(circle at 25% 20%, #581c87 0%, #1e1b4b 85%)',
        previewTextColor: '#fde68a',
        previewInnerBorder: '1.5px solid #fbbf24',
    },
    {
        id: 'vaporwave-window',
        code: '#23',
        name: '蒸汽波窗口',
        nameEn: 'Vaporwave OS',
        category: 'anime',
        description: '复古桌面立体倒角窗口与状态栏',
        descriptionEn: 'Classic 90s desktop beveled window and status bar',
        previewBackground: 'linear-gradient(180deg, #d4d4d8 0%, #c0c0c0 100%)',
        previewTextColor: '#111827',
        previewInnerBorder: '2px inset #808080',
    },

    // 5. 材质肌理 (25, 27, 28, 29)
    {
        id: 'kraft-paper',
        code: '#25',
        name: '复古牛皮纸',
        nameEn: 'Kraft Paper',
        category: 'texture',
        description: '暖棕纤维牛皮纸肌理与复古暗角',
        descriptionEn: 'Warm brown kraft paper with natural organic fibers',
        previewBackground: 'linear-gradient(135deg, #d6b88e 0%, #c4a376 55%, #b89466 100%)',
        previewTextColor: '#451a03',
        previewInnerBorder: '1px solid rgba(69, 26, 3, 0.28)',
    },
    {
        id: 'metallic-silver',
        code: '#27',
        name: '液态拉丝银',
        nameEn: 'Brushed Silver',
        category: 'texture',
        description: '未来感金属银拉丝反光质感',
        descriptionEn: 'Futuristic brushed aluminum sheen with fine metallic lines',
        previewBackground:
            'linear-gradient(135deg, #e2e8f0 0%, #94a3b8 28%, #f8fafc 52%, #64748b 76%, #f1f5f9 100%)',
        previewTextColor: '#0f172a',
        previewInnerBorder: '1px solid #ffffff',
    },
    {
        id: 'film-strip',
        code: '#28',
        name: '35mm胶片齿孔',
        nameEn: '35mm Film Strip',
        category: 'texture',
        description: '两侧真实胶片齿孔与暖黄胶卷帧号',
        descriptionEn: 'Authentic 35mm sprocket holes and amber film frame markings',
        previewBackground: 'linear-gradient(90deg, #111113 0%, #18181b 50%, #111113 100%)',
        previewTextColor: '#f59e0b',
        previewInnerBorder: '1px solid #3f3f46',
    },
    {
        id: 'crumpled-washi',
        code: '#29',
        name: '再生手揉和纸',
        nameEn: 'Handmade Washi',
        category: 'texture',
        description: '微皱和纸纤维纹理与自然柔和起伏',
        descriptionEn: 'Softly creased handmade washi paper with subtle fibers',
        previewBackground: 'radial-gradient(at 30% 35%, #faf8f5 0%, #e7e0d3 65%, #f3efe6 100%)',
        previewTextColor: '#57534e',
        previewInnerBorder: '1px solid rgba(87, 83, 78, 0.2)',
    },

    // 6. 手账与做旧 (31, 33, 35, 36)
    {
        id: 'washi-tape',
        code: '#31',
        name: '和纸胶带拼贴',
        nameEn: 'Washi Tape',
        category: 'diy',
        description: '暖白相纸配顶部斜贴半透明格纹和纸胶带',
        descriptionEn: 'Warm photo card taped at the top with translucent washi tape',
        previewBackground: 'linear-gradient(165deg, #faf7f0 0%, #efe8da 100%)',
        previewTextColor: '#334155',
        previewInnerBorder: '1px solid rgba(51, 65, 85, 0.16)',
    },
    {
        id: 'airmail-postcard',
        code: '#33',
        name: '邮票航空信封',
        nameEn: 'Airmail Postcard',
        category: 'diy',
        description: '红蓝白斜纹航空信封边框与复古邮戳',
        descriptionEn: 'Red-and-blue airmail par avion stripes along the outer rim',
        previewBackground:
            'repeating-linear-gradient(45deg, #ef4444 0 4px, #faf6ee 4px 8px, #3b82f6 8px 12px, #faf6ee 12px 16px)',
        previewTextColor: '#1e3a8a',
        previewInnerBorder: '1px solid rgba(30, 58, 138, 0.25)',
    },
    {
        id: 'gothic-thorn',
        code: '#35',
        name: '暗黑哥特荆棘',
        nameEn: 'Gothic Nocturne',
        category: 'diy',
        description: '深炭黑底配银色双线内框与哥特十字装饰',
        descriptionEn: 'Obsidian black with double silver borders and star crosses',
        previewBackground: 'linear-gradient(165deg, #09090b 0%, #18181b 100%)',
        previewTextColor: '#e4e4e7',
        previewInnerBorder: '2px double #a1a1aa',
    },
    {
        id: 'stacked-double',
        code: '#36',
        name: '叠片立体双影',
        nameEn: 'Stacked Polaroid',
        category: 'diy',
        description: '底层微斜叠放拍立得背卡，营造立体层次感',
        descriptionEn: 'Tilted backing card layered behind the front Polaroid print',
        previewBackground: 'linear-gradient(145deg, #faf7f0 0%, #e5dec9 100%)',
        previewTextColor: '#44403c',
        previewInnerBorder: '1px solid rgba(68, 64, 60, 0.2)',
    },
] as const;

export const DEFAULT_FRAME_STYLE_ID: FrameStyleId = 'classic-ivory';

const byId = new Map<string, FrameStyle>(FRAME_STYLES.map(style => [style.id, style]));

export function isKnownFrameStyleId(id: unknown): id is FrameStyleId {
    return typeof id === 'string' && byId.has(id);
}

export function getFrameStyle(id?: string): FrameStyle {
    return (id ? byId.get(id) : undefined) ?? FRAME_STYLES[0];
}

export function filterFrameStyles(category: FrameCategory | 'all' = 'all'): readonly FrameStyle[] {
    if (category === 'all') return FRAME_STYLES;
    return FRAME_STYLES.filter(style => style.category === category);
}

export function pickRandomFrameStyle(
    candidates: readonly FrameStyle[] = FRAME_STYLES,
    excludedIds: readonly string[] = [],
): FrameStyle {
    const pool = candidates.length ? candidates : FRAME_STYLES;
    const excluded = new Set(excludedIds);
    let available = pool.filter(style => !excluded.has(style.id));
    for (let i = 0; !available.length && i < excludedIds.length; i++) {
        excluded.delete(excludedIds[i]);
        available = pool.filter(style => !excluded.has(style.id));
    }
    return available[Math.floor(Math.random() * available.length)];
}
