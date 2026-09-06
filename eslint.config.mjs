import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/",
      "node_modules/",
      // The boshiamy dictionary is generated data: "typos" in it are
      // legitimate boshiamy codes, not English words.
      "src/boshiamy-data.js",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // The IME bar positions the cursor using an intentional zero-width
      // space inside a string literal.
      "no-irregular-whitespace": ["error", { skipStrings: true }],
    },
  },
];
