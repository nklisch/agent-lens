## Browser Lens Investigation Workflow

When the user mentions a browser issue, bug, or unexpected behavior:

1. **Find the session:**
   `bugscope browser sessions --has-markers`
   Look for sessions with markers near the reported time.

2. **Get the overview:**
   `bugscope browser overview <session_id> --around-marker M1`
   Understand the navigation path, errors, and markers.

3. **Search for errors:**
   `bugscope browser search <session_id> --status-codes 400,422,500`
   Find network failures. Also try:
   `bugscope browser search <session_id> --query "validation error"`

4. **Inspect the problem moment:**
   `bugscope browser inspect <session_id> --marker M1 --include network_body,console_context`
   Get full request/response bodies, console output, and surrounding events.

5. **Compare before and after:**
   `bugscope browser diff <session_id> --before <load_time> --after <error_time> --include form_state`
   See what changed between page load and the error.

6. **Generate reproduction artifacts:**
   `bugscope browser replay-context <session_id> --around-marker M1 --format reproduction_steps`
   Or generate a test:
   `bugscope browser replay-context <session_id> --around-marker M1 --format test_scaffold --framework playwright`

### Tips
- Markers placed by the user are labeled [user]. Auto-detected markers are [auto].
- Use `--token-budget` to control response size (default: 3000 tokens for overview, 2000 for search).
- Event IDs from search results can be used with `--event <id>` in inspect.
- HAR export: `bugscope browser export <session_id> --format har --output debug.har`
