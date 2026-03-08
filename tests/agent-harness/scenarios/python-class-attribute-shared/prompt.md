We're seeing wrong item counts when we process multiple customers together. Alice has 5 items and Bob has 1 item. When we process them in a batch, Alice comes back correct at 5, but Bob comes back as 6 — it's like his cart still has Alice's stuff in it. Every customer after the first picks up the previous customers' items.

If a debugger is available, use it — set a breakpoint at the relevant code and inspect the runtime values directly. It will be faster than reasoning from source alone.
