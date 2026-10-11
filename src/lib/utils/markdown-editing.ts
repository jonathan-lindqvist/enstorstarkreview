// Small text edits for the review text editor. Offsets are UTF-16 indices, like textarea
// `selectionStart` and `selectionEnd`.

const LINE_PREFIXES = ['- ', '## '];

const lineStartAt = (text: string, offset: number) => text.lastIndexOf('\n', offset - 1) + 1;

/** Adds or removes a prefix (`- ` or `## `) at the start of the line with the cursor. */
export const toggleLinePrefix = (
	text: string,
	cursor: number,
	prefix: string
): { text: string; cursor: number } => {
	const start = lineStartAt(text, cursor);
	const rest = text.slice(start);
	if (rest.startsWith(prefix)) {
		return {
			text: text.slice(0, start) + rest.slice(prefix.length),
			cursor: Math.max(start, cursor - prefix.length)
		};
	}
	const other = LINE_PREFIXES.find((candidate) => rest.startsWith(candidate)) ?? '';
	return {
		text: text.slice(0, start) + prefix + rest.slice(other.length),
		cursor: Math.max(start, cursor - other.length) + prefix.length
	};
};

/** Puts a marker before and after the selection, or two markers around the cursor. */
export const wrapSelection = (
	text: string,
	start: number,
	end: number,
	marker: string
): { text: string; start: number; end: number } => ({
	text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end),
	start: start + marker.length,
	end: end + marker.length
});

/**
 * Enter at the end of a list item starts the next item; Enter on an empty item ends the list.
 * Returns null when the browser should handle the key.
 */
export const continueListOnEnter = (
	text: string,
	start: number,
	end: number
): { text: string; cursor: number } | null => {
	if (start !== end) return null;
	const lineStart = lineStartAt(text, start);
	const line = text.slice(lineStart, start);
	if (!line.startsWith('- ')) return null;
	if (line.trim() === '-') {
		return { text: text.slice(0, lineStart) + text.slice(start), cursor: lineStart };
	}
	return { text: `${text.slice(0, start)}\n- ${text.slice(start)}`, cursor: start + 3 };
};
