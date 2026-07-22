import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tsParser from "@typescript-eslint/parser";
import pluginVue from "eslint-plugin-vue";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...pluginVue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["app/vue/**/*.{ts,vue}"],
    rules: {
      // React hook immutability rules do not model Vue refs/composables correctly.
      "react-hooks/immutability": "off",
      "react-hooks/rules-of-hooks": "off",
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
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
