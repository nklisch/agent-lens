// Adapter conformance fixture — DO NOT MODIFY without updating conformance test
// Line numbers are referenced in ConformanceFixture definitions.
package main

import "fmt"

func greet(name string) string {
	message := fmt.Sprintf("Hello, %s!", name) // line 8 — insideFunctionLine
	return message
}

func main() {
	items := []string{"alpha", "beta", "gamma"}
	total := 0
	for i, item := range items {
		total += len(item)    // line 16 — loopBodyLine
		greet(item)           // line 17 — functionCallLine
		_ = i
	}
	fmt.Printf("Total chars: %d\n", total)
}
