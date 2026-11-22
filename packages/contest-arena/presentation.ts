export function contestTime(value: Date | number, start: Date | number) {
    const elapsed = Math.floor((+value - +start) / 1000), seconds = Math.abs(elapsed);
    const minutes = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    return `${elapsed < 0 ? '-' : ''}${Math.floor(seconds / 3600)}:${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function juryAnswered(replies: { owner: number }[] = []) {
    return replies.at(-1)?.owner === 0;
}
