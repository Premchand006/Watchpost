import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Without eslint-plugin-react, JSX usage is invisible to no-unused-vars.
      // Components are capitalised, so ignore those names.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    // Context modules export a provider and its hook together.
    files: ["src/context/**/*.jsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["*.config.js", "**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
