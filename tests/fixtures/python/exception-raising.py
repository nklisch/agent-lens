"""Exception breakpoint testing."""


class InsufficientFundsError(Exception):
    def __init__(self, balance: float, amount: float):
        self.balance = balance
        self.amount = amount
        super().__init__(f"Cannot withdraw {amount}, balance is {balance}")


def withdraw(balance: float, amount: float) -> float:
    if amount > balance:
        raise InsufficientFundsError(balance, amount)
    return balance - amount


def process_withdrawals(balance: float, amounts: list[float]) -> float:
    for amount in amounts:
        balance = withdraw(balance, amount)
    return balance


if __name__ == "__main__":
    try:
        final = process_withdrawals(100.0, [30.0, 50.0, 40.0])
        print(f"Final balance: {final}")
    except InsufficientFundsError as e:
        print(f"Error: {e}")
