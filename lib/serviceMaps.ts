export function buildServiceMap(rows: any[], key: string = 'reservation_id') {
    const map = new Map<string, any>();
    for (const r of rows || []) {
        if (r && r[key]) map.set(r[key], r);
    }
    return map;
}

export function buildCruiseMap(rows: any[]) {
    const map = new Map<string, any>();
    for (const r of rows || []) {
        if (!r?.reservation_id) continue;
        const flattened = {
            ...r,
            cruise_name: r.room_price?.cruise_name ?? null,
            room_type: r.room_price?.room_type ?? null,
            room_grade: r.room_price?.room_type ?? null,
        };
        map.set(r.reservation_id, flattened);
    }
    return map;
}