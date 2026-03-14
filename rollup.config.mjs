import typescript from "@rollup/plugin-typescript";
import gas from "rollup-plugin-google-apps-script";

export default {
  input: "src/main.ts",
  output: {
    file: "dist/bundle.js",
    format: "iife",
    name: 'GAS App',
  },
  plugins: [
    typescript(),
    gas(),
  ],
};
