"""Call stack testing: step into/out, nested function calls."""


def add(a: int, b: int) -> int:
    result = a + b
    return result


def multiply(a: int, b: int) -> int:
    total = 0
    for _ in range(b):
        total = add(total, a)
    return total


def calculate(x: int, y: int, z: int) -> int:
    step1 = multiply(x, y)
    step2 = add(step1, z)
    return step2


if __name__ == "__main__":
    result = calculate(3, 4, 5)
    print(f"Result: {result}")
