"""Object inspection and nested attribute testing."""


class Address:
    def __init__(self, street: str, city: str, zip_code: str):
        self.street = street
        self.city = city
        self.zip_code = zip_code


class User:
    def __init__(self, name: str, email: str, address: Address):
        self.name = name
        self.email = email
        self.address = address
        self.orders: list[dict] = []

    def add_order(self, item: str, price: float) -> None:
        self.orders.append({"item": item, "price": price})


def main():
    addr = Address("123 Main St", "Springfield", "62701")
    user = User("Alice", "alice@example.com", addr)
    user.add_order("Widget", 29.99)
    user.add_order("Gadget", 49.99)
    total = sum(o["price"] for o in user.orders)
    print(f"{user.name}'s total: {total}")


if __name__ == "__main__":
    main()
