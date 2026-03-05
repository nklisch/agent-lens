The `init_service` function in `config.py` is returning the wrong `max_rps` value. The service should use the rate limit from the config file, but it's picking up a different value instead.

The test in `test_config.py` demonstrates the failure. Debug this issue and fix the bug so that `test_config.py` passes.
