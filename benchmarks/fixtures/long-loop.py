# Adapter benchmark fixture — long loop (50 iterations)
def process_item(index, value):
    transformed = value.upper()
    length = len(transformed)
    return f"{index}: {transformed} ({length})"

def main():
    items = [f"item_{i}" for i in range(50)]
    results = []
    for i, item in enumerate(items):
        result = process_item(i, item)  # step target
        results.append(result)
    print(f"Processed {len(results)} items")

if __name__ == "__main__":
    main()
