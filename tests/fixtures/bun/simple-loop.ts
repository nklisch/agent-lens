/**
 * Simple loop for basic stepping and variable inspection.
 * TypeScript — runs natively under Bun without compilation.
 */
function sumRange(n: number): number {
	let total = 0;
	for (let i = 0; i < n; i++) {
		total += i;
	}
	return total;
}

const result = sumRange(10);
console.log(`Sum: ${result}`);
