import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".superpowers/browser-playtests/**/build/**",
      "coverage/**",
      ".worktrees/**",
      ".pnpm-store/**",
      "**/*.d.*",
    ],
  },
  {
    files: ["**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      complexity: ["error", { max: 12, variant: "classic" }],
    },
  },
);
