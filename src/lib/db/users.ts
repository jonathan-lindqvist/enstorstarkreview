import type { UserDoc } from '$lib/types/user';
import db from './db';

export const users = db.collection<UserDoc>('users');
