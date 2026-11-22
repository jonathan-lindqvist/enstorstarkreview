export const swiftModels = 'mobile/ios/Sources/EnStorStarkModel';
export const androidModels = 'mobile/android/app/src/main/kotlin/se/enstorstarkreview/app/model';

export const priceValuePaths = {
	web: 'src/lib/utils/price-value.ts',
	ios: `${swiftModels}/PriceValue.swift`,
	android: `${androidModels}/PriceValue.kt`
};

const preserveLines = (value) => value.replace(/[^\r\n]/g, ' ');
const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;

// Keep line offsets while ignoring text inside strings and comments. Both native languages
// support nested block comments.
function sourceCode(source) {
	const tokens = /\/\/[^\r\n]*|\/\*|"""[\s\S]*?"""|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'/g;
	const boundaries = /\/\*|\*\//g;
	let output = '';
	let copied = 0;
	for (let match = tokens.exec(source); match; match = tokens.exec(source)) {
		if (match[0] === '/*') {
			let depth = 1;
			boundaries.lastIndex = tokens.lastIndex;
			for (let boundary = boundaries.exec(source); boundary; boundary = boundaries.exec(source)) {
				depth += boundary[0] === '/*' ? 1 : -1;
				if (depth === 0) break;
			}
			tokens.lastIndex = depth === 0 ? boundaries.lastIndex : source.length;
		}
		output +=
			source.slice(copied, match.index) +
			preserveLines(source.slice(match.index, tokens.lastIndex));
		copied = tokens.lastIndex;
	}
	return output + source.slice(copied);
}

export function checkNativeImports(path, source) {
	const swift = path.startsWith(`${swiftModels}/`) && path.endsWith('.swift');
	const kotlin = path.startsWith(`${androidModels}/`) && path.endsWith('.kt');
	if (!swift && !kotlin) return [];

	const code = sourceCode(source);
	const imports = swift
		? /^[\t ]*(?:@\w+(?:\([^\n]*?\))?[\t ]+)*import[\t ]+(?:(?:typealias|struct|class|enum|protocol|let|var|func)[\t ]+)?(\w+)/gm
		: /^[\t ]*import[\t ]+([\w.*]+)/gm;
	const presentation = swift
		? /^(?:SwiftUI|UIKit|EnStorStark)$/
		: /^(?:se\.enstorstarkreview\.app\.ui|androidx\.compose\.(?:ui|foundation|material\d*))(?:\.|$)/;

	return [...code.matchAll(imports)]
		.filter(([, dependency]) => presentation.test(dependency))
		.map((match) => ({
			path,
			line: lineAt(code, match.index),
			id: 'mobile/model-boundary',
			message: `Move the use of ${match[1]} to the presentation layer and pass model state or callbacks across the boundary.`
		}));
}

const rating = '(\\d+)';
const limit = '(\\d+(?:\\.\\d+)?)';
const declarations = {
	web: {
		label: 'Web',
		volume: 'ASSUMED_BEER_VOLUME_CL',
		fallback: 'MOST_EXPENSIVE_PRICE_VALUE_RATING',
		gates: 'PRICE_VALUE_GATES',
		list: /\[([^\]]*)\][\t ]+as[\t ]+const[\t ]*;?[\t ]*$/m,
		entry: `\\{\\s*rating:\\s*${rating}\\s*,\\s*belowKrPerCl:\\s*${limit}\\s*,?\\s*\\}`
	},
	ios: {
		label: 'iOS',
		volume: 'assumedVolumeCl',
		fallback: 'mostExpensiveRating',
		gates: 'gates',
		list: /\[([^\]]*)\][\t ]*$/m,
		entry: `\\(\\s*${rating}\\s*,\\s*${limit}\\s*,?\\s*\\)`
	},
	android: {
		label: 'Android',
		volume: 'ASSUMED_VOLUME_CL',
		fallback: 'MOST_EXPENSIVE_RATING',
		gates: 'gates',
		list: /listOf\s*\(([\s\S]*?)\)[\t ]*$/m,
		entry: `${rating}\\s+to\\s+${limit}`
	}
};

function parseGates(text, entry) {
	if (text === undefined) return;
	const item = new RegExp(`\\s*${entry}\\s*(?:,|$)`, 'y');
	const gates = [];
	while (text.slice(item.lastIndex).trim()) {
		const next = item.exec(text);
		if (!next) return;
		gates.push([Number(next[1]), Number(next[2])]);
	}
	return gates;
}

function readDeclaration(source, name, expression) {
	const declaration = new RegExp(
		`^[\\t ]*(?:export |public |static |private |const )*(?:const|let|val)[\\t ]+${name}\\b(?:[\\t ]*:[^=]+)?[\\t ]*=\\s*`,
		'm'
	).exec(source);
	if (!declaration) return { line: 1 };

	const remainder = source.slice(declaration.index + declaration[0].length);
	const literal = expression.exec(remainder);
	return {
		line: lineAt(source, declaration.index),
		value: literal?.index === 0 ? literal[1] : undefined
	};
}

export function checkPriceValueParity(sources) {
	const findings = [];
	const parsed = {};
	for (const [platform, { label, volume, fallback, gates, list, entry }] of Object.entries(
		declarations
	)) {
		const { path, source } = sources[platform];
		const code = sourceCode(source);
		const integer = /^(\d+)[\t ]*;?[\t ]*$/m;
		const values = {
			'assumed volume': readDeclaration(code, volume, integer),
			'ordered rating thresholds': readDeclaration(code, gates, list),
			'fallback rating': readDeclaration(code, fallback, integer)
		};
		values['ordered rating thresholds'].value = parseGates(
			values['ordered rating thresholds'].value,
			entry
		);
		for (const [field, declaration] of Object.entries(values)) {
			if (declaration.value === undefined) {
				findings.push({
					path,
					line: declaration.line,
					id: 'mobile/price-value-parity',
					message: `Could not read the ${label} ${field}. Keep the PriceValue declarations as literals or update the parity check for the new declaration shape.`
				});
			}
		}
		parsed[platform] = values;
	}

	for (const platform of ['ios', 'android']) {
		for (const [field, actual] of Object.entries(parsed[platform])) {
			const expected = parsed.web[field].value;
			if (actual.value === undefined || expected === undefined) continue;
			const want = JSON.stringify(expected);
			const found = JSON.stringify(actual.value);
			if (want === found) continue;
			findings.push({
				path: sources[platform].path,
				line: actual.line,
				id: 'mobile/price-value-parity',
				message: `Match the web ${field} in price-value.ts. Expected ${want}, found ${found}. Update all three PriceValue implementations together.`
			});
		}
	}
	return findings;
}
