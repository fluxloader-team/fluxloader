export type GameInstance = {
    tally: (...args: unknown[]) => unknown;
    ensureQueuedStructuresAreBuilt: (...args: unknown[]) => unknown;
    state: {
      store: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      session: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      environment: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      shared: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
    };
    config: {
      store: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      session: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      environment: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      shared: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
    };
    admin: {
      store: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      session: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      environment: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
      shared: {
        version: string;
        player: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        resources: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        world: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        projectiles: any[];
        structures: any[];
        drones: any[];
        pipes: any[];
        pumpsCache: any[];
        worldItems: any[];
        gloom: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        machineryEngine: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        meta: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        options: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        scene: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        tutorial: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        progression: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        upgrades: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        hints: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
        objectives: {
          x: number;
          y: number;
          width: number;
          height: number;
          velocity: {
            x: number;
            y: number;
          };
          threshold: {
            x: number;
            y: number;
          };
          onGround: boolean;
          inventory: any[];
          buildings: any[];
          tech: {
            x: number;
            y: number;
          };
          action: null;
          hotbar: {
            x: number;
            y: number;
          };
          animations: {
            x: number;
            y: number;
          };
          grapplingHook: boolean;
          cooldowns: {
            x: number;
            y: number;
          };
          isHovering: boolean;
          weaponsMeta: {
            x: number;
            y: number;
          };
        };
      };
    };
    trackMemoryConsumption: (...args: unknown[]) => unknown;
    moveCamera: (...args: unknown[]) => unknown;
    __defineGetter__: (...args: any[]) => any;
    __defineSetter__: (...args: any[]) => any;
    hasOwnProperty: (...args: any[]) => any;
    __lookupGetter__: (...args: any[]) => any;
    __lookupSetter__: (...args: any[]) => any;
    isPrototypeOf: (...args: any[]) => any;
    propertyIsEnumerable: (...args: any[]) => any;
    toString: (...args: any[]) => any;
    valueOf: (...args: any[]) => any;
    toLocaleString: (...args: any[]) => any;
  };
  