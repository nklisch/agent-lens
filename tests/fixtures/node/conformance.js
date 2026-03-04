// Adapter conformance fixture — DO NOT MODIFY without updating conformance test
// Line numbers are referenced in ConformanceFixture definitions.
function greet(name) {
	const message = `Hello, ${name}!`; // line 4 — insideFunctionLine
	return message;
}

function main() {
	const items = ["alpha", "beta", "gamma"];
	let total = 0;
	for (let i = 0; i < items.length; i++) {
		total += items[i].length; // line 12 — loopBodyLine
		greet(items[i]); // line 13 — functionCallLine
	}
	console.log(`Total chars: ${total}`);
}

main();
