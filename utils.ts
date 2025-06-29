/*
Get the actual size of a resource downloaded by the browser (e.g. an image) in bytes.
This is supported in recent versions of all major browsers, with some caveats.
See https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/encodedBodySize
*/
export function getResourceSize(url: string): number | undefined {
    const entry = (window?.performance?.getEntriesByName(url) as PerformanceResourceTiming[] | undefined)?.[0];
    if (entry) {
        const size = entry?.encodedBodySize;
        return size || undefined;
    } else {
        return undefined;
    }
}

export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export const uploadDisabled: boolean = process.env.NEXT_PUBLIC_DISABLE_UPLOADS?.toLowerCase() === 'true';
