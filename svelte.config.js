import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Dynamically choose adapter:
// - Prefer @sveltejs/adapter-vercel (production)
// - Fallback to @sveltejs/adapter-auto for local/dev/editor environments
let vercelAdapter;
let autoAdapter;
let useVercel = false;

try {
  ({ default: vercelAdapter } = await import("@sveltejs/adapter-vercel"));
  useVercel = true;
} catch {
  ({ default: autoAdapter } = await import("@sveltejs/adapter-auto"));
  useVercel = false;
}

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: useVercel
      ? vercelAdapter({
          // Ensure Vercel uses Node.js 20 runtime for SvelteKit build/serve
          runtime: "nodejs20.x"
        })
      : autoAdapter()
  }
};

export default config;
