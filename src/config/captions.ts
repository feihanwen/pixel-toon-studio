export const CAPTION_THEMES = {
    daily: '日常碎片', travel: '出逃计划', city: '城市漫游', nature: '山野来信',
    friends: '见面快乐', together: '恋爱日常', playful: '随便发发', minimal: '极简短句'
} as const;
export type CaptionTheme = keyof typeof CAPTION_THEMES;
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
    ['daily', 'zh', 'plog', ['小欲望，小安稳，小满足', '小日常，小欢喜，小美好']],
    ['daily', 'en', 'moments', ['Life lately.', 'Slow days.']],
    ['travel', 'zh', 'travel', ['快乐出逃中', '地球探险记', '旅途小记', '出门放风啦']],
    ['travel', 'en', 'vacation', ['Vacation mode: on.', 'Postcard from here.']],
    ['city', 'zh', 'night', ['夜间模式', '今晚出门了', '城市灯光', '日落后见'], true],
    ['city', 'en', 'night', ['After dark.', 'Out and about.']],
    ['nature', 'zh', 'nature', ['把生活调成自然频道', '不赶时间，只追风景']],
    ['nature', 'zh', 'travel', ['去见山海', '晒点风光']],
    ['nature', 'en', 'natureEn', ['Fresh air, full heart.', 'Saltwater cures everything.']],
    ['friends', 'zh', 'friends', ['于是，我们合拍', '碎碎念念，终于见面', '见了，我们', '从窗台的花聊到地球爆炸']],
    ['friends', 'en', 'friendsEn', ['Good kind of chaos.', 'Still friends, somehow.'], true],
    ['together', 'zh', 'couple', ['持续喜欢', '分享恋爱碎片']],
    ['together', 'zh', 'together', ['今日同行人', '同一个人，不同的日子']],
    ['together', 'en', 'couple', ['Sweet time.', 'Be with U.']],
    ['playful', 'zh', 'selfie', ['冒个泡', '发发库存', '今日朋友圈已营业', '凑9张照片好难']],
    ['playful', 'en', 'moments', ['Proof I left the house.', 'Too lazy to caption.']],
    ['minimal', 'zh', 'minimal', ['就这样', '无主题', '一些瞬间', '近期喜欢'], true],
    ['minimal', 'en', 'short', ['Just because.', 'No context needed.']],
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
export function randomCaption(exclude?: string): string { return pickRandomCaption(CAPTIONS, exclude ? [exclude] : []).id; }

export function validateCaptionLibrary(): string[] {
    const problems: string[] = [];
    const ids = new Set<string>(), texts = new Set<string>();
    if (CAPTIONS.length < 48) problems.push('文案总数不足 48');
    for (const theme of Object.keys(CAPTION_THEMES) as CaptionTheme[]) {
        for (const language of ['zh', 'en'] as CaptionLanguage[]) {
            const count = CAPTIONS.filter(caption => caption.theme === theme && caption.language === language).length;
            if (count < (language === 'zh' ? 4 : 2)) problems.push(`${theme}/${language} 数量不足`);
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
