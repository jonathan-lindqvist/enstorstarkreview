import db from '#lib/db/db.js';
import type { BarReview } from '#lib/types/bar-review.js';

export const bars = db.collection<BarReview>('bars');
