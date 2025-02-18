import { GameInstance } from "../types/gameinstance";
import { Mod } from "./mod";

function start() {
  class TsExampleMod extends Mod {
    constructor() {
      super({
        name: "ts-example-mod",
        version: "1.0.8",
        dependencies: [],
        modauthor: "stinkfire",
      });
      this.patches = [
        {
          type: "process",
          func: (data: any) => {
            console.log("ts-example-mod: process patch");
            return data;
          },
        },
      ];
    }

    async onMenuLoaded() {
      const res = await fetch("test/mod");
      const text = await res.text();
    }

    onPostMove(t: GameInstance["state"]) {
      const accelerationVal = 1;
      const acceleration = {
        x: 0,
        y: 0,
      };
      const maxVelocity = {
        x: 240,
        y: 240,
      };
      if (this.isKeyDown("a")) {
        acceleration.x = accelerationVal;
      }
      if (this.isKeyDown("d")) {
        acceleration.x = -accelerationVal;
      }
      if (this.isKeyDown("w")) {
        acceleration.y = accelerationVal;
      }
      if (this.isKeyDown("s")) {
        acceleration.y = -accelerationVal;
      }
      const velocity = this.getData("velocity", { x: 0, y: 0 });
      const isMoving = acceleration.x !== 0 || acceleration.y !== 0;
      if (!isMoving) {
        velocity.x *= 0.95;
        velocity.y *= 0.95;
        if (Math.abs(velocity.x) < 0.01) {
          velocity.x = 0;
        }
        if (Math.abs(velocity.y) < 0.01) {
          velocity.y = 0;
        }
      } else {
        velocity.y -= acceleration.y;
        velocity.x -= acceleration.x;

        if (velocity.x > maxVelocity.x) {
          velocity.x = maxVelocity.x;
        }
        if (velocity.x < -maxVelocity.x) {
          velocity.x = -maxVelocity.x;
        }
        if (velocity.y > maxVelocity.y) {
          velocity.y = maxVelocity.y;
        }
        if (velocity.y < -maxVelocity.y) {
          velocity.y = -maxVelocity.y;
        }
      }

      t.store.player.velocity.x = velocity.x;
      t.store.player.velocity.y = velocity.y;
      this.setData("velocity", velocity);
    }

    onGameLoaded() {
      console.log(
        `ts-example-mod: game loaded, game version: ${gameInstance.state.store.version}`
      );
    }

    postUnload() {
      console.log("ts-example-mod: post unload");
    }
    postLoad(): void {
      // this.player.position =
      console.log("ts-example-mod: post load");
    }
  }
  const mod = new TsExampleMod();

  const exampleMod = mod.export();
  return mod.export();
}

export default start();
