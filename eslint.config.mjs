import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import pluginVue from "eslint-plugin-vue";

export default defineConfig([
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module" },
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tsParser, extraFileExtensions: [".vue"] },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["lib/tournament/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["app/**", "worker/**", "**/app/**", "**/worker/**"] },
      ],
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["app/vue/components/ui/**/*.{ts,vue}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["**/features/**"] }],
    },
  },
  globalIgnores(["dist/**", "node_modules/**", ".wrangler/**"]),
]);
