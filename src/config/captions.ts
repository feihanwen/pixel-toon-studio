import { getLanguage, type AppLanguage } from './preferences';

export const CAPTION_THEMES = {
    daily: '日常碎片', travel: '出逃计划', city: '城市漫游', nature: '山野来信',
    friends: '见面快乐', together: '恋爱日常', playful: '随便发发', minimal: '极简短句',
    mood: '情绪碎片', healing: '治愈微光',
} as const;
export const CAPTION_THEMES_EN: Record<keyof typeof CAPTION_THEMES, string> = {
    daily: 'Daily Moments',
    travel: 'Getaway',
    city: 'City Walk',
    nature: 'Into Nature',
    friends: 'With Friends',
    together: 'Sweet Time',
    playful: 'Photo Dump',
    minimal: 'Minimal',
    mood: 'Mood & Feels',
    healing: 'Soft & Healing',
};
export type CaptionTheme = keyof typeof CAPTION_THEMES;
export function captionThemeLabel(theme: CaptionTheme, lang: AppLanguage = 'zh'): string {
    return lang === 'en' ? CAPTION_THEMES_EN[theme] : CAPTION_THEMES[theme];
}
export type CaptionLanguage = 'zh' | 'en';
export interface Caption { id: string; language: CaptionLanguage; theme: CaptionTheme; text: string; source: string; sourceUrl: string; adapted?: boolean }

// Online social-caption selections. Punctuation/emoji are simplified for print;
// adaptations are explicitly marked. References are also collected in docs/CAPTION_SOURCES.md.
const sources = {
    daily: ['微文案 · 日常生活', 'https://weiwenan.com/qitawenan/2013.html'],
    plog: ['新浪 · 日常生活碎片', 'https://www.sina.cn/news/detail/5351482694308348.html'],
    travel: ['去哪儿 · 旅行朋友圈文案', 'https://travelnews.qunar.com/qa_strategy/guiyang-holiday-travel-friend-circle-captions'],
    nature: ['新浪 · 上山去感受自然', 'https://www.sina.cn/news/detail/5303271730184469.html'],
    friends: ['甜片壁纸 / 新浪 · 朋友见面', 'https://www.sina.cn/news/detail/5287559560954124.html'],
    couple: ['星瑶Summer / 新浪 · 情侣日常', 'https://www.sina.cn/news/detail/4983450207257474.html'],
    together: ['GirlStyle · 情侣文案', 'https://pretty.presslogic.com/article/772882/couple-instagram-captions'],
    selfie: ['太平洋电脑网 · 自拍文案', 'https://g.pconline.com.cn/x/1345/13458005.html'],
    dump: ['Pallyy · Photo dump captions', 'https://pallyy.com/blog/photo-dump-captions'],
    short: ['Influencer Marketing Hub · Short captions', 'https://influencermarketinghub.com/short-captions-instagram/'],
    vacation: ['Pallyy · Vacation captions', 'https://pallyy.com/blog/vacation-captions'],
    night: ['Viral Insta Captions · Night out', 'https://viralinstacaptions.com/night-out-captions-for-instagram/'],
    moments: ['Allapulla · Life lately', 'https://allapulla.app/blog/life-lately-instagram-story/'],
    friendsEn: ['BulkPublish · Friends captions', 'https://www.bulkpublish.com/zh-hans/blog/friends-captions-for-instagram/'],
    minimal: ['CaptionWink · Short captions', 'https://captionwink.com/short-captions/'],
    natureEn: ['Travel captions · Beach & nature', 'https://bestsitestobuy.com/blog/instagram-travel-captions/'],
} as const;
type SourceKey = keyof typeof sources;
type Selection = [theme: CaptionTheme, language: CaptionLanguage, source: SourceKey, texts: string[], adapted?: boolean];
const selections: Selection[] = [
    ['daily', 'zh', 'daily', ['日常的镜头', '发送库存']],
    ['daily', 'zh', 'plog', [
        '小欲望，小安稳，小满足',
        '小日常，小欢喜，小美好',
        '把普通的一天过出质感',
        '今天也有好好生活',
        '琐碎里藏着温柔',
        '平淡日子泛着微光',
        '留住此刻的烟火气',
        '慢慢走，也算在向前',
    ]],
    ['daily', 'en', 'moments', [
        'Life lately.',
        'Slow days.',
        'Little things that made me smile.',
        'Romanticizing an ordinary Tuesday.',
        'Collecting small, quiet joys.',
        'Soft mornings and warm coffee.',
        'Grateful for this gentle pace.',
        'Nothing grand, just felt good.',
        'A calm chapter in my own time.',
        'Holding onto the simple days.',
    ]],
    ['travel', 'zh', 'travel', [
        '快乐出逃中',
        '地球探险记',
        '旅途小记',
        '出门放风啦',
        '去没有天花板的地方',
        '把烦恼留在上一站',
        '换个城市呼吸一阵',
        '奔赴一场久违的自由',
        '心先一步出发了',
        '见一面远方的风',
    ]],
    ['travel', 'en', 'vacation', [
        'Vacation mode: on.',
        'Postcard from here.',
        'Left my worries at the gate.',
        'Chasing horizons and a lighter heart.',
        'Somewhere new, feeling alive.',
        'Out of office, back to myself.',
        'Needed this escape more than I knew.',
        'Miles away from yesterday.',
        'Taking the scenic route for once.',
        'Packing light, breathing deep.',
    ]],
    ['city', 'zh', 'night', [
        '夜间模式',
        '今晚出门了',
        '城市灯光',
        '日落后见',
        '霓虹把心事照得很轻',
        '在陌生街角和自己和解',
        '晚风吹散白天的疲惫',
        '穿过人海，只为这一刻',
        '路灯亮起时最想念自由',
        '喧嚣里的短暂抽离',
    ], true],
    ['city', 'en', 'night', [
        'After dark.',
        'Out and about.',
        'Neon lights and quiet thoughts.',
        'Lost in the rhythm of the streets.',
        'City noise, oddly comforting tonight.',
        'Golden hour on concrete corners.',
        'Walking nowhere with a full mind.',
        'Late trains and glowing windows.',
        'Breathing in the evening rush.',
        'Finding stillness in a loud city.',
    ]],
    ['nature', 'zh', 'nature', [
        '把生活调成自然频道',
        '不赶时间，只追风景',
        '风一吹，心就松下来了',
        '在树影里躲了一整个下午',
        '大海会接住所有沉默',
        '抬头看云，什么都别想',
        '山风替我说了没说出口的话',
        '被阳光晒暖的一刻',
    ]],
    ['nature', 'zh', 'travel', ['去见山海', '晒点风光']],
    ['nature', 'en', 'natureEn', [
        'Fresh air, full heart.',
        'Saltwater cures everything.',
        'Let the wind carry the heavy parts.',
        'Quietly healed by the horizon.',
        'Under open skies, everything softens.',
        'Rooted in the stillness of the trees.',
        'Ocean air and an unhurried soul.',
        'Sunlight felt like an apology today.',
        'Nature never rushes, neither will I.',
        'Breathing out what I no longer need.',
    ]],
    ['friends', 'zh', 'friends', [
        '于是，我们合拍',
        '碎碎念念，终于见面',
        '见了，我们',
        '从窗台的花聊到地球爆炸',
        '和你们在一起不用假装懂事',
        '笑到失焦也没关系',
        '久别重逢还是原来的样子',
        '谢谢你们接住我的坏情绪',
        '快乐是有人一起犯傻',
        '哪怕不说话也很自在',
    ]],
    ['friends', 'en', 'friendsEn', [
        'Good kind of chaos.',
        'Still friends, somehow.',
        'Loud laughs and zero filters.',
        'With you all, I can drop the armor.',
        'Same jokes, different year.',
        'My favorite people to do nothing with.',
        'Grateful for the ones who stay.',
        'Heart felt lighter the moment you arrived.',
        'Unfiltered joy in human form.',
        'Never outgrowing this laughter.',
    ], true],
    ['together', 'zh', 'couple', [
        '持续喜欢',
        '分享恋爱碎片',
        '心动是藏不住的偏爱',
        '想到你的时候风都是甜的',
        '谢谢你让普通日子发光',
        '在你身边不用赶时间',
        '眼神交汇的那一秒最真实',
        '想把所有温柔都留给你',
    ]],
    ['together', 'zh', 'together', ['今日同行人', '同一个人，不同的日子']],
    ['together', 'en', 'couple', [
        'Sweet time.',
        'Be with U.',
        'Safe feels a lot like you.',
        'Still get butterflies, every time.',
        'My favorite place is next to you.',
        'Softness I only show around you.',
        'Falling for the same person again.',
        'You make the quiet moments glow.',
        'Home is wherever your hand is.',
        'Loving you feels effortless today.',
    ]],
    ['playful', 'zh', 'selfie', [
        '冒个泡',
        '发发库存',
        '今日朋友圈已营业',
        '凑9张照片好难',
        '精神状态勉强稳定',
        '今天的快乐有点莫名其妙',
        '懒得营业但还是发一张',
        '先开心再说，别的明天想',
        '允许自己偶尔不体面',
        '生活有点抓马但还行',
    ]],
    ['playful', 'en', 'moments', [
        'Proof I left the house.',
        'Too lazy to caption.',
        'Unhinged, caffeinated, and thriving.',
        'Zero thoughts, just vibes.',
        'Doing my best, whatever that means.',
        'Chaotic good energy today.',
        'Mentally still in bed, honestly.',
        'No plot, just random frames.',
        'Surviving on snacks and delusion.',
        'A little messy, still iconic.',
    ]],
    ['minimal', 'zh', 'minimal', [
        '就这样',
        '无主题',
        '一些瞬间',
        '近期喜欢',
        '仅此而已',
        '留白',
        '心照不宣',
        '此刻',
        '刚刚好',
        '没关系',
    ], true],
    ['minimal', 'en', 'short', [
        'Just because.',
        'No context needed.',
        'As it is.',
        'Enough for now.',
        'Still here.',
        'Breathe.',
        'In passing.',
        'Quietly.',
        'Let it be.',
        'Simply this.',
    ]],
    ['mood', 'zh', 'plog', [
        '有些情绪只适合放在夜里',
        '突然有点想念过去的自己',
        '表面平静，心里下了场小雨',
        '没关系，难过也是生活的一部分',
        '心事被晚霞染得有点酸涩',
        '想说的话最后都变成了沉默',
        '这一刻有点孤独，但不讨厌',
        '情绪上头时就看看天空吧',
        '偶尔也会觉得世界太吵了',
        '怀念那个还没学会克制的夏天',
    ], true],
    ['mood', 'en', 'moments', [
        'Feeling everything a little too deeply.',
        'Missing a version of me I outgrew.',
        'Quietly heavy, quietly hopeful.',
        'Some feelings never find the right words.',
        'Nostalgia hits hardest at dusk.',
        'A little ache, a little grace.',
        'Lonely in a crowded room tonight.',
        'Letting the sadness pass without fighting it.',
        'My heart was loud, so I stayed quiet.',
        'Bittersweet memories in soft focus.',
    ], true],
    ['healing', 'zh', 'daily', [
        '慢一点，你已经做得很好了',
        '温柔对待那个疲惫的自己',
        '一切都会在合适的时候好起来',
        '今天允许自己什么都不做',
        '谢谢没有放弃的自己',
        '心里的褶皱正在慢慢被抚平',
        '给自己一点时间重新发芽',
        '原来松一口气是这种感觉',
        '愿你被这个世界轻轻拥抱',
        '把心交还给安静和微风',
    ], true],
    ['healing', 'en', 'minimal', [
        'Be gentle with yourself today.',
        'Healing is quiet, not a race.',
        'Proud of myself for making it here.',
        'Softness is its own kind of strength.',
        'Giving myself permission to rest.',
        'Everything feels a little lighter now.',
        'You survived what once felt impossible.',
        'Choosing peace over perfection tonight.',
        'Small steps still count as moving on.',
        'Finally at ease in my own skin.',
    ], true],
];
const counts = new Map<string, number>();
export const CAPTIONS: Caption[] = selections.flatMap(([theme, language, sourceKey, texts, adapted]) => texts.map(text => {
    const key = `${language}-${theme}`, number = (counts.get(key) ?? 0) + 1;
    counts.set(key, number);
    const [source, sourceUrl] = sources[sourceKey];
    return { id: `social-${key}-${String(number).padStart(2, '0')}`, language, theme, text, source, sourceUrl, adapted };
}));
const byId = new Map(CAPTIONS.map(caption => [caption.id, caption]));

export const CUSTOM_CAPTION_PREFIX = 'custom:';
export const MAX_CUSTOM_CAPTION_LENGTH = 48;

export function normalizeCustomCaption(text: string): string {
    return text.replace(/[\x00-\x1f\r\n]+/g, ' ').trim().slice(0, MAX_CUSTOM_CAPTION_LENGTH);
}

export function isCustomCaptionId(id: string): boolean {
    return typeof id === 'string'
        && id.startsWith(CUSTOM_CAPTION_PREFIX)
        && normalizeCustomCaption(id.slice(CUSTOM_CAPTION_PREFIX.length)).length > 0;
}

export function customCaptionValue(id: string): string {
    return isCustomCaptionId(id) ? normalizeCustomCaption(id.slice(CUSTOM_CAPTION_PREFIX.length)) : '';
}

export function customCaptionId(text: string): string {
    const normalized = normalizeCustomCaption(text);
    return normalized ? `${CUSTOM_CAPTION_PREFIX}${normalized}` : CAPTIONS[0].id;
}

export function getCaption(id: string): Caption | null {
    return byId.get(id) ?? null;
}

export function isKnownCaptionId(id: string): boolean {
    return byId.has(id) || isCustomCaptionId(id);
}

export function captionText(id: string): string {
    if (isCustomCaptionId(id)) return customCaptionValue(id);
    return getCaption(id)?.text ?? CAPTIONS[0].text;
}
export function filterCaptions(options: { language?: CaptionLanguage | 'all'; theme?: CaptionTheme | 'all' } = {}): Caption[] {
    return CAPTIONS.filter(caption => (options.language === undefined || options.language === 'all' || caption.language === options.language)
        && (options.theme === undefined || options.theme === 'all' || caption.theme === options.theme));
}
export function pickRandomCaption(candidates: readonly Caption[], excludedIds: readonly string[] = []): Caption {
    if (!candidates.length) throw new Error('没有可选的相框文案');
    const excluded = new Set(excludedIds);
    let available = candidates.filter(caption => !excluded.has(caption.id));
    for (let i = 0; !available.length && i < excludedIds.length; i++) {
        excluded.delete(excludedIds[i]);
        available = candidates.filter(caption => !excluded.has(caption.id));
    }
    return available[Math.floor(Math.random() * available.length)];
}
export function randomCaptionPool(appLang: AppLanguage = getLanguage()): Caption[] {
    return appLang === 'en' ? filterCaptions({ language: 'en' }) : CAPTIONS;
}
export function dialogRandomCandidates(
    options: readonly Caption[],
    appLang: AppLanguage,
    filterLang: CaptionLanguage | 'all',
): readonly Caption[] {
    if (appLang === 'en' && filterLang === 'all') {
        const english = options.filter(caption => caption.language === 'en');
        if (english.length > 0) return english;
    }
    return options;
}
export function randomCaption(exclude?: string, appLang: AppLanguage = getLanguage()): string {
    return pickRandomCaption(randomCaptionPool(appLang), exclude ? [exclude] : []).id;
}

export function validateCaptionLibrary(): string[] {
    const problems: string[] = [];
    const ids = new Set<string>(), texts = new Set<string>();
    if (CAPTIONS.length < 200) problems.push('文案总数不足 200');
    for (const theme of Object.keys(CAPTION_THEMES) as CaptionTheme[]) {
        for (const language of ['zh', 'en'] as CaptionLanguage[]) {
            const count = CAPTIONS.filter(caption => caption.theme === theme && caption.language === language).length;
            if (count < 10) problems.push(`${theme}/${language} 数量不足`);
        }
    }
    for (const caption of CAPTIONS) {
        if (!caption.source || !caption.sourceUrl.startsWith('https://')) problems.push(`缺少来源：${caption.id}`);
        if (ids.has(caption.id)) problems.push(`重复 ID：${caption.id}`);
        ids.add(caption.id);
        const normalized = caption.text.trim().toLocaleLowerCase();
        if (texts.has(normalized)) problems.push(`重复文案：${caption.text}`);
        texts.add(normalized);
        if (!normalized || /[\x00-\x1f#]/.test(caption.text)) problems.push(`无效文案：${caption.id}`);
        if (caption.language === 'zh' && [...caption.text].filter(char => /\p{Script=Han}/u.test(char)).length > 18) problems.push(`中文过长：${caption.id}`);
        if (caption.language === 'en' && caption.text.length > 48) problems.push(`英文过长：${caption.id}`);
    }
    return problems;
}
