import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router.js";

declare global {
	interface Window {
		__SPA_NAVIGATE__?: (path: string) => void;
	}
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount("#app");

// Expose Vue Router's navigate function globally for test automation
window.__SPA_NAVIGATE__ = (path: string) => {
	router.push(path);
};
