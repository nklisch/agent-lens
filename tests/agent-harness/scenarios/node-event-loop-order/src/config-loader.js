/**
 * Service configuration loader.
 * Fetches config asynchronously and provides it to request handlers.
 */

let _config = null;

/**
 * Simulate fetching configuration (in real code this would be a file read
 * or HTTP call to a config service).
 * @returns {Promise<Object>}
 */
async function fetchConfig() {
	return {
		maxRetries: 3,
		timeout: 5000,
		features: ["caching", "compression"],
	};
}

/**
 * Initialize the configuration by fetching it.
 * BUG: Uses .then() instead of await. The .then() callback runs as a
 * microtask — after the current synchronous call stack completes, not
 * inline. So _config is still null when the caller reads it.
 */
export function initConfig() {
	fetchConfig().then((cfg) => {
		_config = cfg;
	});
}

/**
 * Return the current configuration.
 * @returns {Object|null}
 */
export function getConfig() {
	return _config;
}

/**
 * Reset the configuration (for testing).
 */
export function resetConfig() {
	_config = null;
}

/**
 * Process a request using the loaded config values.
 * Falls back to conservative defaults if config is not loaded.
 *
 * @param {Object} requestData - Arbitrary request payload
 * @returns {Object} Request data enriched with config values
 */
export function processRequest(requestData) {
	initConfig();

	// BUG: _config is still null here — the .then() microtask hasn't
	// executed yet because we're still in the synchronous call stack.
	const config = getConfig();
	const timeout = config?.timeout ?? 1000;
	const maxRetries = config?.maxRetries ?? 1;

	return {
		...requestData,
		timeout,
		maxRetries,
		configLoaded: config !== null,
	};
}
