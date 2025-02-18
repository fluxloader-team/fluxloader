import { Keyboard } from "puppeteer-core";
import { Player } from "./game/player";

type ModPatch = {
  type: "process" | "regex";
  func?: (data: any) => any;
  pattern?: string;
  replace?: string;
  expectedMatches?: number;
};

type ModExport = {
  modinfo: ModInfo;
  patches: ModPatch[];
  api?: any;
  onMenuLoaded?: () => void;
  onGameLoaded?: () => void;
  onLoad?: () => void;
  onUnload?: () => void;
  onEvent?: (event: string, ...args: any) => void;
};

type LogLevels = "info" | "warn" | "error" | "debug";

type ModInfo = {
  name: string;
  version: string;
  dependencies: string[];
  modauthor: string;
};

let modData = (globalThis as any).modData ?? {};
(globalThis as any).modData = modData;

type EventTypes = "postMove";
export class Mod implements ModExport {
  modinfo: ModInfo;
  data: Record<string, any> = {};
  keyStates: Record<string, boolean> = {};
  subscriptsion: Record<string, any> = {};

  _player: Player | null = null;
  get player() {
    if (this._player == null) {
      this._player = new Player(this);
    }
    return this._player;
  }

  constructor(info: ModInfo) {
    this.modinfo = info;
  }

  load() {
    this.preLoad();
    this.postLoad();
  }
  unload() {
    this.preUnload();
    this._player = null;
    this.postUnload();
  }

  // Test
  patches: ModPatch[] = [];
  api?: any;

  onMenuLoaded() {}
  onGameLoaded() {}
  preLoad() {}
  postLoad() {}
  preUnload() {}
  postUnload() {}
  onKeyDown(e: KeyboardEvent) {
    const key = e.key;
    this.keyStates[key] = true;
  }
  onKeyUp(e: KeyboardEvent) {
    const key = e.key;
    this.keyStates[key] = false;
  }
  log(level: LogLevels, ...args: any[]) {
    console[level](`[${this.modinfo.name}]`, ...args);
  }
  logWarn(...args: any[]) {
    this.log("warn", ...args);
  }
  logError(...args: any[]) {
    this.log("error", ...args);
  }
  logInfo(...args: any[]) {
    this.log("info", ...args);
  }
  logDebug(...args: any[]) {
    this.log("debug", ...args);
  }

  getModId() {
    return this.modinfo.name;
  }
  getDataStore() {
    if (modData[this.getModId()] == null) {
      modData[this.getModId()] = {};
    }
    return modData[this.getModId()];
  }

  setData(key: string, value: any) {
    key = this.getModId() + "." + key;
    this.getDataStore()[key] = value;
  }

  getData<T>(key: string, def: T): T {
    key = this.getModId() + "." + key;
    return this.getDataStore()[key] ?? def;
  }

  isKeyDown(key: string) {
    return this.keyStates[key] ?? false;
  }
  isKeyUp(key: string) {
    return !this.isKeyDown(key);
  }

  serialize() {}

  export(): ModExport {
    return {
      patches: [],
      modinfo: this.modinfo,
      api: this.api,
      onMenuLoaded: (...args) => {
        return this.onMenuLoaded(...args);
      },
      onGameLoaded: (...args) => {
        return this.onGameLoaded(...args);
      },
      onUnload: (...args) => {
        return this.unload(...args);
      },
      onLoad: (...args) => {
        return this.load(...args);
      },
      onEvent: (event: string, ...args: any) => {
        const self = this as any;
        if (self[event]) {
          self[event](...args);
        }
      },
    };
  }
}
