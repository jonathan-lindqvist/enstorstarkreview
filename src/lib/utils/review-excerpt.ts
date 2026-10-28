// Mirrors the apps' ReviewMarkdown.plainText, so cards show the same one-line description.
const HEADING = /^(#{1,6}) /;
const BULLET_ITEM = /^[-*+] /;
const ORDERED_ITEM = /^\d{1,9}[.)] /;

type ListKind = 'bullet' | 'ordered';

export const getReviewExcerpt = (description: string): string => {
	const blocks: string[] = [];
	let list: ListKind | null = null;

	for (const rawLine of description.split(/\r?\n/)) {
		const line = rawLine.trim();
		const heading = HEADING.exec(line);
		const kind: ListKind | null = BULLET_ITEM.test(line)
			? 'bullet'
			: ORDERED_ITEM.test(line)
				? 'ordered'
				: null;

		if (!line) {
			list = null;
		} else if (heading) {
			list = null;
			blocks.push(line.slice(heading[1].length).replace(/^[\s#]+|[\s#]+$/g, ''));
		} else if (kind) {
			const item = line.replace(kind === 'bullet' ? BULLET_ITEM : ORDERED_ITEM, '');
			if (list === kind) blocks[blocks.length - 1] += ` · ${item}`;
			else blocks.push(item);
			list = kind;
		} else {
			// Paragraph lines and list-item continuations read the same once joined.
			blocks.push(line);
		}
	}

	return blocks
		.join(' ')
		.replace(/\*\*|__|`/g, '')
		.replace(/\s+/g, ' ')
		.trim();
};
