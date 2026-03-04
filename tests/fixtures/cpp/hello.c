#include <stdio.h>

int greet(const char *name) {
    int len = 0;
    while (name[len]) len++;     /* line 5 — insideFunctionLine */
    printf("Hello, %s!\n", name); /* line 6 — breakpoint target */
    return len;
}

int main(void) {
    const char *items[] = {"alpha", "beta", "gamma"};
    int total = 0;
    for (int i = 0; i < 3; i++) {
        total += greet(items[i]);  /* line 14 — functionCallLine */
    }
    printf("Total chars: %d\n", total);
    return 0;
}
