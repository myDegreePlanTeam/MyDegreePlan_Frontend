import { execSync } from 'node:child_process'
import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Writes dist/version.json: which Frontend commit this build is. The web, desktop and Docker builds are the same bundle, so this
// is how parity/watch.mjs tells whether each platform is running the latest one. Vercel sets VERCEL_GIT_COMMIT_SHA (it has no .git);
// a Docker image build has no .git either and may pass MDP_FRONTEND_COMMIT; everywhere else git knows.
function buildIdentity() {
  return {
    name: 'mdp-build-identity',
    apply: 'build',
    generateBundle() {
      let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.MDP_FRONTEND_COMMIT || null
      if (!commit) {
        try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* not a git checkout */ }
      }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ commit, builtAt: new Date().toISOString() }) + '\n' })
    },
  }
}

export default defineConfig({
  plugins: [react(), buildIdentity()],
  // parity/ has its own package and its own tests (node --test, run by `npm test` inside parity/ and by CI); vitest must not collect them.
  test: { exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', 'parity/**'] },
  build: {
    rollupOptions: {
      output: {
        // rolldown (Vite 8's bundler) only supports manualChunks as a
        // function — the object shorthand from classic Rollup isn't
        // implemented yet. The function receives each module's resolved
        // file path and returns the chunk name it should land in.
        // Vite normalises all paths to forward slashes on every OS.
        manualChunks(id) {
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) {
            return 'vendor'
          }
        },
      },
    },
  },
})
