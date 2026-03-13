import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
	plugins: [vue()],
	define: {
		// Enable Vue devtools hooks in production build for framework observer testing
		__VUE_PROD_DEVTOOLS__: "true",
	},
	build: {
		outDir: "dist",
		minify: false,
		sourcemap: true,
	},
	server: {
		port: 5174,
	},
});
