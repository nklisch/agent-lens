# Adapter benchmark fixture — deep call stack
# When breakpoint hits level_10, there are 10+ frames on the stack
def level_10(x):
    result = x * 2  # breakpoint target
    return result

def level_9(x):
    return level_10(x + 1)

def level_8(x):
    return level_9(x + 1)

def level_7(x):
    return level_8(x + 1)

def level_6(x):
    return level_7(x + 1)

def level_5(x):
    return level_6(x + 1)

def level_4(x):
    return level_5(x + 1)

def level_3(x):
    return level_4(x + 1)

def level_2(x):
    return level_3(x + 1)

def level_1(x):
    return level_2(x + 1)

def main():
    result = level_1(0)
    print(f"Result: {result}")

if __name__ == "__main__":
    main()
