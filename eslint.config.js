export default [
  { ignores: ["dist/**", "node_modules/**", ".github/**", ".sdd/**", "src-tauri/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["src/**/*.js", "scripts/**/*.mjs", "test/**/*.mjs", "e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: Object.fromEntries([
        "window", "document", "console", "URL", "setTimeout", "clearTimeout",
        "requestAnimationFrame", "localStorage", "IntersectionObserver", "TextDecoder", "TextEncoder", "getComputedStyle"
      ].map((name) => [name, "readonly"]))
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "eqeqeq": "error"
    }
  },
  {
    files: ["test/**/*.mjs"],
    languageOptions: { globals: { Buffer: "readonly", setImmediate: "readonly", fetch: "readonly" } }
  }
];
