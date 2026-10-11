// The review wizard is in beta and only reachable by this URL. It creates drafts through the
// create page's own load and action, so sign-in, auditing, and saving stay the same.
export { actions, load } from '../+page.server';
