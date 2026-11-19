import { ObjectId } from 'mongodb';

export const AWARD_LABELS = { gold: '金牌', silver: '银牌', bronze: '铜牌' } as const;
export type Award = '' | keyof typeof AWARD_LABELS;

export interface Photo {
    id: string;
    src: string;
    caption: string;
}

export interface Album {
    _id: ObjectId;
    domainId: string;
    owner: number;
    title: string;
    year: number;
    date: string;
    description: string;
    award?: Award;
    published: boolean;
    cover: string;
    photos: Photo[];
    revision: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    source?: { discussion: ObjectId, section: number, fragment: string };
}

export function fields(input: Record<string, any>) {
    const title = String(input.title || '').trim();
    if (!title || title.length > 140) throw new Error('比赛名称需为 1–140 个字符');
    const year = Number(input.year || 0);
    if (!Number.isInteger(year) || (year !== 0 && (year < 1900 || year > 2100))) throw new Error('年份需在 1900–2100 之间');
    const date = String(input.date || '').trim();
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(date).getTime())
        || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('请填写有效的比赛日期');
    if (date && Number(date.slice(0, 4)) !== year) throw new Error('比赛日期与归档年份不一致');
    const description = String(input.description || '').trim();
    if (description.length > 20000) throw new Error('比赛简介最多 20000 个字符');
    const award = String(input.award || '') as Award;
    if (award && !Object.keys(AWARD_LABELS).includes(award)) throw new Error('请选择金牌、银牌、铜牌或不显示');
    return { title, year, date, description, award, published: [true, 'true', 'on', '1'].includes(input.published) };
}

export function orderedPhotos(input: unknown, current: Photo[]) {
    if (!Array.isArray(input) || input.length > 500) throw new Error('一个相册最多 500 张照片');
    const byId = new Map(current.map((photo) => [photo.id, photo]));
    const seen = new Set<string>();
    return input.map((item) => {
        if (!item || typeof item.id !== 'string' || !byId.has(item.id) || seen.has(item.id)) throw new Error('照片列表无效，请刷新页面重试');
        seen.add(item.id);
        const caption = String(item.caption || '').trim();
        if (caption.length > 200) throw new Error('单张照片的说明最多 200 个字符');
        return { ...byId.get(item.id), caption };
    });
}

export function escapeSearch(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function paginateYears(years: { year: number, count: number }[], target = 12) {
    const pages: number[][] = [];
    let page: number[] = [];
    let count = 0;
    for (const item of years) {
        if (page.length && count + item.count > target) {
            pages.push(page);
            page = [];
            count = 0;
        }
        page.push(item.year);
        count += item.count;
    }
    if (page.length) pages.push(page);
    return pages;
}
