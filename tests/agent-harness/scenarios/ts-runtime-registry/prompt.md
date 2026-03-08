The app crashes on startup when it tries to resolve the RateLimiter service. The error says a dependency service wasn't found, and the key in the error message doesn't match anything we can find in the source. The RateLimiter depends on CacheService, but somehow the container can't find it.

If a debugger is available, use it — set a breakpoint at the relevant code and inspect the runtime values directly. It will be faster than reasoning from source alone.
