/**
 * Range validation framework.
 * Creates named validators from range definitions and applies them to datasets.
 */

/**
 * Create an array of named range validators from range definitions.
 * Each validator checks whether a value falls within its low/high bounds.
 *
 * @param {Array<{name: string, low: number, high: number}>} ranges
 * @returns {Array<{name: string, validate: (value: number) => boolean}>}
 */
export function makeRangeValidators(ranges) {
	const validators = [];
	for (var i = 0; i < ranges.length; i++) {
		// BUG: `var` is function-scoped, not block-scoped. All closures
		// below capture the same `low` and `high` variables, which hold
		// the LAST iteration's values after the loop completes.
		var name = ranges[i].name;
		var low = ranges[i].low;
		var high = ranges[i].high;

		validators.push({
			name: name,
			validate: function (value) {
				return value >= low && value <= high;
			},
		});
	}
	return validators;
}

/**
 * Run all validators against a set of values and return which values
 * pass each validator.
 *
 * @param {Array<{name: string, low: number, high: number}>} ranges
 * @param {number[]} values
 * @returns {Object.<string, number[]>} Map of validator name -> passing values
 */
export function validateAll(ranges, values) {
	const validators = makeRangeValidators(ranges);
	const results = {};
	for (const v of validators) {
		results[v.name] = values.filter((val) => v.validate(val));
	}
	return results;
}

/**
 * Check if a single value passes all validators.
 * @param {Array<{name: string, low: number, high: number}>} ranges
 * @param {number} value
 * @returns {boolean}
 */
export function passesAll(ranges, value) {
	const validators = makeRangeValidators(ranges);
	return validators.every((v) => v.validate(value));
}
