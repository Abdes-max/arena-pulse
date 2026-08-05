import React from 'react';
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

// Entry point used both by `bundle()` in recap-render.service.ts and by
// `npx remotion studio`/`npx remotion render` when previewing this
// composition directly (see the recap module's README).
registerRoot(RemotionRoot);
