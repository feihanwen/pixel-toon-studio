import { describe, expect, it, vi } from 'vitest';
import {
    blobToShareFile,
    canNativeShareFiles,
    isMobileBrowser,
    tryShareFilesToPhotos,
} from '../src/imaging/export';

function mockWindow(coarse: boolean, desktop = false): Window {
    return {
        pixelToonDesktop: desktop ? {} : undefined,
        matchMedia: (query: string) =>
            ({
                matches: query === '(pointer: coarse)' ? coarse : false,
            }) as MediaQueryList,
    } as unknown as Window;
}

describe('mobile export helpers', () => {
    it('detects mobile browsers accurately without misclassifying desktop or Electron', () => {
        expect(
            isMobileBrowser(mockWindow(true), {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
                platform: 'iPhone',
                maxTouchPoints: 5,
                webdriver: false,
            } as unknown as Navigator),
        ).toBe(true);

        expect(
            isMobileBrowser(mockWindow(true), {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
                platform: 'MacIntel',
                maxTouchPoints: 5,
                webdriver: false,
            } as unknown as Navigator),
        ).toBe(true);

        expect(
            isMobileBrowser(mockWindow(false), {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                platform: 'MacIntel',
                maxTouchPoints: 0,
                webdriver: false,
            } as unknown as Navigator),
        ).toBe(false);

        expect(
            isMobileBrowser(mockWindow(true, true), {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
                platform: 'iPhone',
                maxTouchPoints: 5,
                webdriver: false,
            } as unknown as Navigator),
        ).toBe(false);
    });

    it('creates properly typed File instances for OS share sheet', () => {
        const pngFile = blobToShareFile(new Blob(['abc']), 'photo.png', 'png');
        expect(pngFile.name).toBe('photo.png');
        expect(pngFile.type).toBe('image/png');

        const jpgFile = blobToShareFile(new Blob(['abc'], { type: 'image/jpeg' }), 'photo.jpg', 'jpeg');
        expect(jpgFile.name).toBe('photo.jpg');
        expect(jpgFile.type).toBe('image/jpeg');
    });

    it('returns shared, cancelled, or fallback outcomes from tryShareFilesToPhotos', async () => {
        const file = blobToShareFile(new Blob(['img'], { type: 'image/png' }), 'test.png', 'png');

        const shareOk = vi.fn().mockResolvedValue(undefined);
        expect(
            await tryShareFilesToPhotos([file], 'test.png', {
                canShare: () => true,
                share: shareOk,
            } as unknown as Navigator),
        ).toBe('shared');
        expect(shareOk).toHaveBeenCalledWith({ files: [file], title: 'test.png' });

        const abortErr = new DOMException('Cancelled', 'AbortError');
        expect(
            await tryShareFilesToPhotos([file], 'test.png', {
                canShare: () => true,
                share: vi.fn().mockRejectedValue(abortErr),
            } as unknown as Navigator),
        ).toBe('cancelled');

        const expiredGestureErr = new DOMException('User activation expired', 'NotAllowedError');
        expect(
            await tryShareFilesToPhotos([file], 'test.png', {
                canShare: () => true,
                share: vi.fn().mockRejectedValue(expiredGestureErr),
            } as unknown as Navigator),
        ).toBe('fallback');

        expect(
            canNativeShareFiles([file], {
                canShare: () => {
                    throw new Error('unsupported');
                },
                share: vi.fn(),
            } as unknown as Navigator),
        ).toBe(false);
    });
});
