import typescript from "@rollup/plugin-typescript";
import gas from "rollup-plugin-gas";

export default {
  input: "src/main.ts",
  output: {
    dir: "dist",
    format: "es",
  },
  plugins: [
    typescript(),
    gas({
        toplevel: true,
    }),
  ],
};
