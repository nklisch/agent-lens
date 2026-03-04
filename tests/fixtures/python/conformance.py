# Adapter conformance fixture — DO NOT MODIFY without updating conformance test
# Line numbers are referenced in ConformanceFixture definitions.
def greet(name):
    message = f"Hello, {name}!"  # line 4 — insideFunctionLine
    return message

def main():
    items = ["alpha", "beta", "gamma"]
    total = 0
    for i, item in enumerate(items):
        total += len(item)        # line 11 — loopBodyLine
        greet(item)               # line 12 — functionCallLine
    print(f"Total chars: {total}")

if __name__ == "__main__":
    main()
