import db from '$lib/db/db';
import type { BarReview } from '$lib/types/bar-review';

export const bars = db.collection<BarReview>('bars');
