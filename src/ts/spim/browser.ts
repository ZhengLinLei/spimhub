/* =========================================================================
    SpimHub - browser entry of the engine: exposes the global `SPIM` class
    used by the GUI (src/ts/app).

    © 2026 ZhengLinLei <zheng9112003@icloud.com>
    MIT License
 ========================================================================== */

import SPIM from './spim';

(globalThis as unknown as { SPIM: typeof SPIM }).SPIM = SPIM;
