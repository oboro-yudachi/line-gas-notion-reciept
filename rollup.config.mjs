import typescript from "@rollup/plugin-typescript";
import gas from "rollup-plugin-google-apps-script";

export default {
  input: "src/コード.ts",
  output: {
    dir: "dist",
    format: "esm",
    name: 'GASApp'
  },
  plugins: [
    typescript(),
    gas(),
  ],
};
