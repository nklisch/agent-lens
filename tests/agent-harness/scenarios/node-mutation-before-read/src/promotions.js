/**
 * Catalog promotion engine.
 * Applies promotional pricing to a product catalog and computes statistics
 * about the original vs promotional prices.
 */

/**
 * Apply promotional prices to catalog items and return a summary.
 *
 * For each item in `promotions`, if the SKU exists in the catalog:
 *   - Sets the item's price to the promotional price
 *   - Records the savings (original - promotional)
 *
 * After applying promotions, computes the average original price
 * across ALL items in the catalog (promoted and non-promoted).
 *
 * @param {Object} catalog - { sku: { name, price, category } }
 * @param {Object} promotions - { sku: promoPrice }
 * @returns {{ updated: number, avgOriginalPrice: number, totalSavings: number }}
 */
export function applyPromotions(catalog, promotions) {
	let updated = 0;
	let totalSavings = 0;

	for (const [sku, promoPrice] of Object.entries(promotions)) {
		if (catalog[sku]) {
			const oldPrice = catalog[sku].price;
			catalog[sku].price = promoPrice;
			catalog[sku].savings = oldPrice - promoPrice;
			totalSavings += oldPrice - promoPrice;
			updated++;
		}
	}

	// BUG: catalog prices already overwritten above — reads mutated values
	// instead of the originals. The average is too low for promoted items.
	const prices = Object.values(catalog).map((item) => item.price);
	const avgOriginal = prices.reduce((a, b) => a + b, 0) / prices.length;

	return {
		updated,
		avgOriginalPrice: Math.round(avgOriginal * 100) / 100,
		totalSavings: Math.round(totalSavings * 100) / 100,
	};
}

/**
 * Run a promotion campaign and return a full report.
 * @param {Object} catalog
 * @param {Object} promotions
 * @returns {{ summary: Object, promotedItems: Array, catalogSize: number }}
 */
export function runPromotionCampaign(catalog, promotions) {
	const promotedItems = [];
	for (const [sku, promoPrice] of Object.entries(promotions)) {
		if (catalog[sku]) {
			promotedItems.push({
				sku,
				name: catalog[sku].name,
				originalPrice: catalog[sku].price,
				promoPrice,
			});
		}
	}

	const summary = applyPromotions(catalog, promotions);

	return {
		summary,
		promotedItems,
		catalogSize: Object.keys(catalog).length,
	};
}
