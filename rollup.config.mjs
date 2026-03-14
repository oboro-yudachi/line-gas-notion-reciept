import typescript from "@rollup/plugin-typescript";
import gas from "rollup-plugin-gas";

export default {
  input: "src/main.ts",
  output: {
    file: "dist/bundle.js",
    format: "cjs",
    name: 'GAS App'
  },
  plugins: [
    typescript(),
    gas(),
  ],
};
