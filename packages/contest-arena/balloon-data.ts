import { badgeTextColor, problemColors } from './scoreboard';

export const balloonPalette = [
    ['红色', problemColors[0]], ['黄绿色', problemColors[1]], ['蓝色', problemColors[2]],
    ['紫色', problemColors[3]], ['黑色', problemColors[4]], ['浅青色', problemColors[5]],
    ['黄色', problemColors[6]], ['薄荷绿', problemColors[7]], ['天蓝色', problemColors[8]],
    ['玫红色', problemColors[9]], ['橙色', '#ff8800'], ['粉色', '#ffb6c1'],
    ['白色', '#ffffff'], ['灰色', '#808080'], ['棕色', '#a0522d'], ['深绿色', '#008000'],
].map(([name, color]) => ({ name, color }));

const legacyColors = { red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00',
    black: '#000000', white: '#ffffff', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
    gray: '#808080', grey: '#808080', cyan: '#00ffff', magenta: '#ff00ff', brown: '#a52a2a' };

export function balloonColor(value: unknown) {
    if (typeof value !== 'string') return '';
    const color = value.trim().toLowerCase();
    if (/^#[a-f0-9]{6}$/.test(color)) return color;
    if (/^#[a-f0-9]{3}$/.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
    return Object.hasOwn(legacyColors, color) ? legacyColors[color] : '';
}

export function balloonConfig(tdoc: any) {
    return Object.fromEntries(tdoc.pids.map((pid, index) => {
        const value = tdoc.balloon?.[pid];
        const color = balloonColor(typeof value === 'string' ? value : value?.color)
            || problemColors[index % problemColors.length];
        const name = typeof value?.name === 'string' && value.name.trim()
            ? value.name.trim().slice(0, 30) : balloonPalette.find((p) => p.color === color)?.name || '自定义';
        return [pid, { color, name }];
    }));
}

export function validateBalloonConfig(pids: number[], input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('气球配色格式无效');
    const config: Record<number, { color: string, name: string }> = {};
    if (Object.keys(input).some((pid) => !pids.includes(Number(pid)))) throw new Error('配色中包含本场比赛以外的题目');
    for (const pid of pids) {
        const value = Object.hasOwn(input, pid) ? input[pid] : null;
        const color = balloonColor(typeof value === 'string' ? value : value?.color);
        if (!color) throw new Error(`题目 ${pid} 的颜色无效，请选择预设颜色或输入十六进制色值`);
        const name = typeof value === 'string' ? '' : value?.name;
        if (name !== undefined && (typeof name !== 'string' || name.length > 30)) throw new Error('颜色名称最多填写 30 个字符');
        config[pid] = { color, name: name?.trim() || balloonPalette.find((p) => p.color === color)?.name || '自定义' };
    }
    return config;
}

export function balloonView(tdoc: any, balloons: any[], users: any, statuses: any[], records: any[]) {
    const config = balloonConfig(tdoc);
    const roster = new Map(statuses.map((s) => [s.uid, s]));
    const results = new Map(records.map((r) => [String(r._id), r]));
    const journalOwners = new Map(statuses.flatMap((s) => (s.journal || []).map((e) => [String(e.rid), s.uid])));
    const memberOwners = new Map(statuses.filter((s) => s.attend && !s.registrationCancelled)
        .flatMap((s) => (s.members || []).map((uid) => [uid, s.uid])));
    const accepted = new Map<string, any>();
    for (const r of records) {
        if (r.status !== 1 || !tdoc.pids.includes(r.pid)) continue;
        const owner = journalOwners.get(String(r._id)) ?? memberOwners.get(r.uid) ?? r.uid;
        const key = `${owner}/${r.pid}`;
        if (!accepted.has(key) || String(r._id) < String(accepted.get(key)._id)) accepted.set(key, r);
    }
    const rows = balloons.map((b) => {
        const s: any = roster.get(b.uid);
        const members = s?.members?.length ? s.members : [b.uid];
        const u = users[b.uid] || {};
        const sender = typeof b.sent === 'number' ? users[b.sent] : null;
        const result: any = results.get(String(b.rid || b._id));
        const alternative = accepted.get(`${b.uid}/${b.pid}`);
        const withdrawn = !!s?.registrationCancelled || !tdoc.pids.includes(b.pid)
            || ((!result || result.status !== 1) && !alternative);
        const color = config[b.pid] || { color: '#808080', name: '未配置' };
        const index = tdoc.pids.indexOf(b.pid);
        return {
            id: String(b._id), uid: b.uid, pid: b.pid,
            createdAt: (b.createdAt || b._id.getTimestamp?.())?.toISOString() || '',
            label: index >= 0 ? String.fromCharCode(65 + index) : `P${b.pid}`,
            team: s?.displayName || u.name || u.displayName || u.uname || String(b.uid),
            username: u.uname || '',
            className: [...new Set(members.map((uid) => users[uid]?.class).filter(Boolean))].join(' / ') || '未填写班级',
            classroom: typeof s?.classroom === 'string' ? s.classroom : '',
            seat: typeof s?.seat === 'string' ? s.seat : '',
            color: color.color, colorName: color.name, textColor: badgeTextColor(color.color),
            first: !!b.first, delivered: !!b.sent, withdrawn,
            status: withdrawn ? 'withdrawn' : b.sent ? 'delivered' : 'pending',
            sender: sender?.name || sender?.displayName || sender?.uname || (b.sent ? '未记录' : ''),
            submittedAt: (alternative?._id || b._id).getTimestamp?.()?.toISOString() || '',
            sentAt: b.sentAt instanceof Date ? b.sentAt.toISOString() : '',
        };
    });
    return { rows, counts: { pending: rows.filter((r) => r.status === 'pending').length,
        delivered: rows.filter((r) => r.status === 'delivered').length,
        withdrawn: rows.filter((r) => r.withdrawn).length, total: rows.length } };
}
