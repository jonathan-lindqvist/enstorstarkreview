import db from '$lib/db/db';
import type { BarReview } from '$lib/types';

export const bars = db.collection<BarReview>('bars');
