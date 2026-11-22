import {
	binding,
	constantInitializer,
	identifierName,
	importedName,
	propertyName,
	rule,
	unwrap
} from './ast.js';

const apiHttp = '/src/lib/server/api/http';
const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'fallback']);

const requireApiHandler = rule(
	{
		method:
			'Export const {{name}} = apiHandler(...) using $lib/server/api/http so unexpected errors become API problem responses.',
		wildcard:
			'Export each HTTP method explicitly with apiHandler from $lib/server/api/http instead of using a wildcard export.'
	},
	'Use the shared error handling wrapper for native API endpoints',
	(context) => {
		const report = (node, name) => context.report({ node, messageId: 'method', data: { name } });

		return {
			ExportNamedDeclaration(node) {
				if (node.exportKind === 'type') return;
				const declaration = node.declaration;
				if (declaration?.type === 'VariableDeclaration') {
					for (const variable of declaration.declarations) {
						if (variable.id.type !== 'Identifier') {
							for (const { name } of context.sourceCode.getDeclaredVariables(variable)) {
								if (methods.has(name)) report(variable, name);
							}
							continue;
						}
						const name = identifierName(variable.id);
						if (!methods.has(name)) continue;
						const initializer = unwrap(variable.init);
						if (
							declaration.kind !== 'const' ||
							initializer?.type !== 'CallExpression' ||
							importedName(context, initializer.callee, apiHttp) !== 'apiHandler'
						) {
							report(variable, name);
						}
					}
				} else if (methods.has(identifierName(declaration?.id))) {
					report(declaration, declaration.id.name);
				}
				for (const specifier of node.specifiers) {
					const name = identifierName(specifier.exported);
					if (specifier.exportKind !== 'type' && methods.has(name)) report(specifier, name);
				}
			},
			ExportAllDeclaration(node) {
				if (node.exportKind !== 'type') context.report({ node, messageId: 'wildcard' });
			}
		};
	}
);

const requestBodyProperties = new Set([
	'arrayBuffer',
	'blob',
	'body',
	'bytes',
	'formData',
	'json',
	'text'
]);

function isRequest(context, expression) {
	const node = unwrap(expression);
	if (node?.type === 'MemberExpression') return propertyName(node) === 'request';
	if (node?.type === 'NewExpression') return identifierName(node.callee) === 'Request';
	if (node?.type === 'CallExpression') {
		const callee = unwrap(node.callee);
		return (
			callee.type === 'MemberExpression' &&
			propertyName(callee) === 'clone' &&
			isRequest(context, callee.object)
		);
	}
	if (node?.type !== 'Identifier') return false;

	const definition = binding(context.sourceCode, node)?.defs[0];
	const { name } = definition ?? {};
	const annotation = name?.typeAnnotation?.typeAnnotation;
	if (annotation?.type === 'TSTypeReference')
		return identifierName(annotation.typeName) === 'Request';
	if (name?.parent?.type === 'Property' && name.parent.parent.type === 'ObjectPattern') {
		return propertyName(name.parent) === 'request';
	}
	const initializer = constantInitializer(definition);
	if (
		initializer &&
		definition.node.id.type === 'Identifier' &&
		initializer.range[0] < node.range[0]
	) {
		return isRequest(context, initializer);
	}
	return node.name === 'request';
}

const useApiJsonBody = rule(
	'Read API request bodies with readJsonBody(request, schema) from $lib/server/api/http to apply the OpenAPI byte limit and validation.',
	'Apply the shared native API body budget and schema validation',
	(context) => {
		const report = (node) => context.report({ node, messageId: 'useOwner' });

		return {
			MemberExpression(node) {
				if (requestBodyProperties.has(propertyName(node)) && isRequest(context, node.object)) {
					report(node);
				}
			},
			VariableDeclarator(node) {
				if (node.id.type === 'ObjectPattern' && isRequest(context, node.init)) {
					for (const property of node.id.properties) {
						if (property.type === 'Property' && requestBodyProperties.has(propertyName(property)))
							report(property);
					}
				}
			}
		};
	}
);

const reviewPublication = '/src/lib/server/review-publication';
const reviewPersistence = '/src/lib/server/reviews/persistence';
const collection = '/src/lib/db/bars';
const sharedFilters = new Set(['PUBLIC_REVIEW_FILTER', 'ACTIVE_REVIEW_FILTER']);
const reads = new Set([
	'find',
	'findOne',
	'count',
	'countDocuments',
	'estimatedDocumentCount',
	'distinct',
	'aggregate'
]);
const writes = new Set([
	'insertOne',
	'insertMany',
	'updateOne',
	'updateMany',
	'replaceOne',
	'deleteOne',
	'deleteMany',
	'findOneAndUpdate',
	'findOneAndReplace',
	'findOneAndDelete',
	'bulkWrite'
]);

function singleProperty(expression, name) {
	const node = unwrap(expression);
	if (node?.type !== 'ObjectExpression' || node.properties.length !== 1) return;
	const [property] = node.properties;
	if (property.type === 'Property' && property.kind === 'init' && propertyName(property) === name) {
		return unwrap(property.value);
	}
}

function hasVisibility(context, expression) {
	const node = unwrap(expression);
	if (sharedFilters.has(importedName(context, node, reviewPublication))) return true;
	if (node?.type === 'CallExpression') {
		return importedName(context, node.callee, reviewPublication) === 'withReviewVisibility';
	}
	const conjunction = singleProperty(node, '$and');
	return (
		conjunction?.type === 'ArrayExpression' &&
		conjunction.elements.some((operand) => hasVisibility(context, operand))
	);
}

const reviewCollectionBoundary = rule(
	{
		filter:
			'Apply PUBLIC_REVIEW_FILTER, authenticated ACTIVE_REVIEW_FILTER or withReviewVisibility from $lib/server/review-publication. Combine predicates with $and. For aggregates, put the filter in the first $match.',
		reservation:
			'Check slug reservations through the shared review write workflow. Its persistence uses countDocuments(reviewSlugReservationFilter(...), { limit: 1 }).',
		write:
			'Call the shared review workflow in $lib/server/reviews for mutations so web and API writes share validation, audit and cache rules.'
	},
	'Use the shared rules for review collection reads and route writes',
	(context) => ({
		CallExpression(node) {
			const callee = unwrap(node.callee);
			if (
				callee.type !== 'MemberExpression' ||
				importedName(context, callee.object, collection) !== 'bars'
			)
				return;
			const method = propertyName(callee);
			if (writes.has(method) && /\/src\/routes\//.test(context.filename.replaceAll('\\', '/'))) {
				context.report({ node, messageId: 'write' });
				return;
			}
			if (!reads.has(method)) return;
			const args = node.arguments;
			let filter = args[method === 'distinct' ? 1 : 0];
			const predicate = unwrap(filter);
			if (
				predicate?.type === 'CallExpression' &&
				importedName(context, predicate.callee, reviewPersistence) === 'reviewSlugReservationFilter'
			) {
				const limit = singleProperty(args[1], 'limit');
				const allowed =
					method === 'countDocuments' &&
					args.length === 2 &&
					limit?.type === 'Literal' &&
					limit.value === 1 &&
					/\/src\/lib\/server\/reviews\//.test(context.filename.replaceAll('\\', '/'));
				if (!allowed) context.report({ node, messageId: 'reservation' });
				return;
			}
			if (method === 'aggregate') {
				const pipeline = unwrap(filter);
				filter =
					pipeline?.type === 'ArrayExpression'
						? singleProperty(pipeline.elements[0], '$match')
						: undefined;
			}
			if (method === 'estimatedDocumentCount' || !hasVisibility(context, filter)) {
				context.report({ node, messageId: 'filter' });
			}
		}
	})
);

export const serverRules = {
	'require-api-handler': requireApiHandler,
	'use-api-json-body': useApiJsonBody,
	'review-collection-boundary': reviewCollectionBoundary
};
