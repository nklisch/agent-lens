import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	build: {
		outDir: "dist",
		// No minification: preserves component function names for framework observer testing
		minify: false,
		sourcemap: true,
	},
	server: {
		port: 5173,
	},
});
