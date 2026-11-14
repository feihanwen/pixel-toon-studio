import { it, expect } from 'vitest';
import { fixture, newStyles, processStyle } from './style-fixtures';

it('records new style 1600x1200 preview performance without machine-dependent timing failures', () => {
    const source = fixture(1600, 1200);
    for (const id of newStyles) {
        const start = performance.now(), result = processStyle(id, source, 1600, 1200);
        console.info(`${id} 1600x1200: ${Math.round(performance.now() - start)} ms`);
        expect(result).toHaveLength(source.length);
    }
}, 30000);
