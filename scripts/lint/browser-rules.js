import { isBuiltin } from 'node:module';
import {
	binding,
	constantInitializer,
	modulePath,
	propertyName,
	rule,
	unwrap,
	visitModuleReferences
} from './ast.js';

const isServerOnly = (specifier, filename, typeOnly) => {
	const path = modulePath(specifier, filename);
	return (
		/^\$env\/(?:static|dynamic)\/private$/.test(path) ||
		path === '$app/server' ||
		/\/src\/lib\/(?:server|db)(?:\/|$)/.test(path) ||
		/\.server(?:\.[cm]?[jt]s)?$/.test(path) ||
		(!typeOnly && (isBuiltin(path) || path === 'mongodb'))
	);
};

const noServerImport = rule(
	'{{specifier}} belongs in server code. Put shared contracts in $lib/types and pass data from a server load or endpoint.',
	'Keep browser and shared modules free of server dependencies',
	(context) =>
		visitModuleReferences(context, (node, specifier, onlyTypes) => {
			if (isServerOnly(specifier, context.filename, onlyTypes)) {
				context.report({ node, messageId: 'useOwner', data: { specifier } });
			}
		})
);

const browserGlobals = new Set(['window', 'globalThis', 'self']);

function browserObject(context, expression) {
	const node = unwrap(expression);
	if (node?.type === 'Identifier') {
		const variable = binding(context.sourceCode, node);
		if (!variable?.defs.length) {
			if (node.name === 'navigator') return 'navigator';
			if (browserGlobals.has(node.name)) return 'global';
		}
		const definition = variable?.defs[0];
		const initializer = constantInitializer(definition);
		// Follow earlier const declarations to keep alias resolution bounded.
		if (initializer && initializer.range[0] < node.range[0]) {
			const owner = browserObject(context, initializer);
			if (definition.node.id.type === 'Identifier') return owner;
			const property = definition.name.parent;
			if (
				owner === 'global' &&
				property?.type === 'Property' &&
				property.parent === definition.node.id &&
				propertyName(property) === 'navigator'
			)
				return 'navigator';
		}
	}
	if (
		node?.type === 'MemberExpression' &&
		propertyName(node) === 'navigator' &&
		browserObject(context, node.object) === 'global'
	)
		return 'navigator';
}

const useLocationHelper = rule(
	'Use watchUserLocation from $lib/client/user-location so location respects visitor preferences and the watcher is disposed.',
	'Route browser location access through the preference-aware helper',
	(context) => {
		const report = (node) => context.report({ node, messageId: 'useOwner' });

		const checkPattern = (pattern, receiver) => {
			if (pattern?.type !== 'ObjectPattern') return;
			for (const property of pattern.properties) {
				if (property.type !== 'Property') continue;
				const name = propertyName(property);
				if (receiver === 'navigator' && name === 'geolocation') report(property);
				if (receiver === 'global' && name === 'navigator')
					checkPattern(property.value, 'navigator');
			}
		};

		return {
			MemberExpression(node) {
				if (
					propertyName(node) === 'geolocation' &&
					browserObject(context, node.object) === 'navigator'
				)
					report(node);
			},
			VariableDeclarator(node) {
				if (node.id.type === 'ObjectPattern')
					checkPattern(node.id, browserObject(context, node.init));
			},
			AssignmentExpression(node) {
				if (node.left.type === 'ObjectPattern')
					checkPattern(node.left, browserObject(context, node.right));
			}
		};
	}
);

export const browserRules = {
	'no-server-import-in-shared': noServerImport,
	'use-location-helper': useLocationHelper
};
