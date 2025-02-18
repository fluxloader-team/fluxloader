import { Mod } from "../mod";

export class Player {
  mod: Mod;

  get position() {
    return this.mod.data.position;
  }
  set position({ x, y }: { x: number; y: number }) {
    this.mod.data.position = { x, y };
  }
  constructor(mod: Mod) {
    this.mod = mod;
    console.log("Player created");
  }
}
