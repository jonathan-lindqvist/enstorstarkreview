import type { User } from '#lib/types/user.js';
import db from './db';

export const users = db.collection<User>('users');
