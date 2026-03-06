/**
 * User input validation utilities.
 * Validates email addresses and filters user records.
 */

// Compiled regex for email validation. The global flag enables reuse
// across multiple calls without recompiling the pattern each time.
const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/g;

/**
 * Check if an email address is valid.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
	return EMAIL_PATTERN.test(email.trim());
}

/**
 * Add an emailValid flag to each user record.
 * @param {Array<{name: string, email: string}>} users
 * @returns {Array<{name: string, email: string, emailValid: boolean}>}
 */
export function validateUsers(users) {
	return users.map((user) => ({
		...user,
		emailValid: isValidEmail(user.email),
	}));
}

/**
 * Return only users with valid emails.
 * @param {Array<{name: string, email: string}>} users
 * @returns {Array<{name: string, email: string}>}
 */
export function filterValidUsers(users) {
	return users.filter((u) => isValidEmail(u.email));
}

/**
 * Generate a validation report for a list of users.
 * @param {Array<{name: string, email: string}>} users
 * @returns {{ total: number, valid: number, invalid: number, invalidEmails: string[] }}
 */
export function validationReport(users) {
	const validated = validateUsers(users);
	const valid = validated.filter((u) => u.emailValid);
	const invalid = validated.filter((u) => !u.emailValid);
	return {
		total: users.length,
		valid: valid.length,
		invalid: invalid.length,
		invalidEmails: invalid.map((u) => u.email),
	};
}
