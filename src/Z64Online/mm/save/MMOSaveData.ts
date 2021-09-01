import { IMMSyncSave } from "@Z64Online/common/types/MMAliases";
import { IKeyRing } from "@Z64Online/common/save/IKeyRing";
import { Z64OnlineEvents, Z64_SaveDataItemSet } from "@Z64Online/common/api/Z64API";
import { bus } from "modloader64_api/EventHandler";
import { IModLoaderAPI } from "modloader64_api/IModLoaderAPI";
import { IMMCore, InventoryItem } from "Z64Lib/API/MM/MMAPI";
import { ProxySide } from "modloader64_api/SidedProxy/SidedProxy";
import { Z64O_PRIVATE_EVENTS } from "../../common/api/InternalAPI";
import { ISaveSyncData } from "@Z64Online/common/save/ISaveSyncData";
import Z64Serialize from "@Z64Online/common/storage/Z64Serialize";
import { rejects } from "assert";

export class MMOSaveData implements ISaveSyncData {
  core!: IMMCore;
  private ModLoader: IModLoaderAPI;
  hash: string = "";

  constructor(core: IMMCore, ModLoader: IModLoaderAPI) {
    this.core = core;
    this.ModLoader = ModLoader;
  }

  private generateWrapper(): IMMSyncSave {
    let obj: any = {};
    let keys = [
      'inventory', 'map_visible', 'map_visited', 'heart_containers', 'magic_meter_size', 'swords', 'shields',
      'questStatus', 'checksum', 'owl_statues', 'double_defense', 'magicBeanCount'
    ];

    obj = JSON.parse(JSON.stringify(this.core.save));
    //obj['permSceneData'] = this.core.save.permSceneData;
    //obj['infTable'] = this.core.save.infTable;
    //obj['weekEventFlags'] = this.core.save.weekEventFlags;
    //obj['dungeon_items'] = this.core.save.dungeonItemManager.getRawBuffer();
    let obj2: any = {};

    for (let i = 0; i < keys.length; i++) {
      obj2[keys[i]] = obj[keys[i]];
    }
    return obj2 as IMMSyncSave;
  }

  createKeyRing(): IKeyRing {
    let obj = { keys: this.core.save.keyManager.getRawKeyBuffer() } as IKeyRing;
    return obj;
  }

  processKeyRing(keys: IKeyRing, storage: IKeyRing, side: ProxySide) {
    for (let i = 0; i < keys.keys.byteLength; i++) {
      if (side === ProxySide.CLIENT) {
        if (this.isNotEqual(keys.keys[i], this.core.save.keyManager.getKeyCountForIndex(i))) {
          this.core.save.keyManager.setKeyCountByIndex(i, keys.keys[i]);
          this.ModLoader.privateBus.emit(Z64O_PRIVATE_EVENTS.UPDATE_KEY_HASH, {});
          bus.emit(Z64OnlineEvents.SAVE_DATA_ITEM_SET, new Z64_SaveDataItemSet(i.toString(), keys.keys[i]));
        }
      } else {
        if (this.isNotEqual(keys.keys[i], storage.keys[i])) {
          storage.keys[i] = keys.keys[i];
        }
      }
    }
  }

  processKeyRing_OVERWRITE(keys: IKeyRing, storage: IKeyRing, side: ProxySide) {
    for (let i = 0; i < keys.keys.byteLength; i++) {
      if (side === ProxySide.CLIENT) {
        this.core.save.keyManager.setKeyCountByIndex(i, keys.keys[i]);
        this.ModLoader.privateBus.emit(Z64O_PRIVATE_EVENTS.UPDATE_KEY_HASH, {});
      }
    }
  }

  createSave(): Buffer {
    let obj = this.generateWrapper();
    let buf = Z64Serialize.serializeSync(obj);
    this.hash = this.ModLoader.utils.hashBuffer(buf);
    return buf;
  }

  private processBoolLoop(obj1: any, obj2: any) {
    Object.keys(obj1).forEach((key: string) => {
      if (typeof (obj1[key]) === 'boolean') {
        if (obj1[key] === true && obj2[key] === false) {
          obj2[key] = true;
          bus.emit(Z64OnlineEvents.SAVE_DATA_ITEM_SET, new Z64_SaveDataItemSet(key, obj2[key]));
        }
      }
    });
  }

  private processMixedLoop(obj1: any, obj2: any, blacklist: Array<string>) {
    Object.keys(obj1).forEach((key: string) => {
      if (blacklist.indexOf(key) > -1) return;
      if (typeof (obj1[key]) === 'boolean') {
        if (obj1[key] === true && obj2[key] === false) {
          obj2[key] = obj1[key];
          bus.emit(Z64OnlineEvents.SAVE_DATA_ITEM_SET, new Z64_SaveDataItemSet(key, obj2[key]));
        }
      } else if (typeof (obj1[key]) === 'number') {
        if (obj1[key] > obj2[key]) {
          obj2[key] = obj1[key];
          bus.emit(Z64OnlineEvents.SAVE_DATA_ITEM_SET, new Z64_SaveDataItemSet(key, obj2[key]));
        }
      }
    });
  }

  private processBoolLoop_OVERWRITE(obj1: any, obj2: any) {
    Object.keys(obj1).forEach((key: string) => {
      if (typeof (obj1[key]) === 'boolean') {
        obj2[key] = obj1[key];
      }
    });
  }

  private processMixedLoop_OVERWRITE(obj1: any, obj2: any, blacklist: Array<string>) {
    Object.keys(obj1).forEach((key: string) => {
      if (blacklist.indexOf(key) > -1) return;
      if (typeof (obj1[key]) === 'boolean') {
        obj2[key] = obj1[key];
      } else if (typeof (obj1[key]) === 'number') {
        obj2[key] = obj1[key];
      }
    });
  }

  private isGreaterThan(obj1: number, obj2: number) {
    if (obj1 === 255) obj1 = 0;
    if (obj2 === 255) obj2 = 0;
    return (obj1 > obj2);
  }

  private isNotEqual(obj1: number, obj2: number) {
    if (obj1 === 255) obj1 = 0;
    if (obj2 === 255) obj2 = 0;
    return (obj1 !== obj2);
  }

  forceOverrideSave(save: Buffer, storage: IMMSyncSave, side: ProxySide) {
    try {
      this.ModLoader.privateBus.emit(Z64O_PRIVATE_EVENTS.LOCK_ITEM_NOTIFICATIONS, {});
      let obj: IMMSyncSave = JSON.parse(save.toString());

      storage.heart_containers = obj.heart_containers;
      storage.magic_meter_size = obj.magic_meter_size;

      storage.inventory.magicBeansCount = obj.inventory.magicBeansCount;

      this.processMixedLoop_OVERWRITE(obj.swords, storage.swords, ['kokiriSword', 'masterSword', 'giantKnife', 'biggoronSword']);
      this.processMixedLoop_OVERWRITE(obj.shields, storage.shields, ['dekuShield', 'hylianShield', 'mirrorShield']);
      this.processMixedLoop_OVERWRITE(obj.questStatus, storage.questStatus, []);
      this.processMixedLoop_OVERWRITE(obj.inventory, storage.inventory, []);


      //storage.permSceneData = obj.permSceneData;
      //storage.weekEventFlags = obj.weekEventFlags;
      //storage.infTable = obj.infTable;

      if (side === ProxySide.CLIENT) {
        this.core.save.dungeonItemManager.setRawBuffer(obj.dungeon_items);
      }
    } catch (err: any) {
      console.log(err.stack);
    }
  }

  isMask(item: InventoryItem) {

  }

  mergeSave(save: Buffer, storage: IMMSyncSave, side: ProxySide, syncMasks: boolean = true): Promise<boolean> {
    return new Promise((accept, reject) => {
      Z64Serialize.deserialize(save).then((obj: IMMSyncSave) => {
        // Another title screen safety check.
        if (obj.checksum === 0) {
          console.log("mergeSave failure")
          return;
        }

        if (obj.heart_containers > storage.heart_containers && obj.heart_containers <= 20) {
          storage.heart_containers = obj.heart_containers;
          bus.emit(Z64OnlineEvents.GAINED_PIECE_OF_HEART, {});
        }
        if (storage.heart_containers > 20) {
          storage.heart_containers = 20;
        }
        if (obj.magic_meter_size > storage.magic_meter_size) {
          storage.magic_meter_size = obj.magic_meter_size;
          bus.emit(Z64OnlineEvents.MAGIC_METER_INCREASED, storage.magic_meter_size);
        }

        if (obj.inventory.magicBeansCount !== storage.inventory.magicBeansCount) {
          storage.inventory.magicBeansCount = obj.inventory.magicBeansCount;
        }

        this.processMixedLoop(obj.swords, storage.swords, []);
        this.processMixedLoop(obj.shields, storage.shields, []);
        this.processMixedLoop(obj.questStatus, storage.questStatus, []);

        if (obj.inventory.FIELD_BOTTLE1 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE1 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE1 = obj.inventory.FIELD_BOTTLE1;
        }

        if (obj.inventory.FIELD_BOTTLE2 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE2 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE2 = obj.inventory.FIELD_BOTTLE2;
        }

        if (obj.inventory.FIELD_BOTTLE3 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE3 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE3 = obj.inventory.FIELD_BOTTLE3;
        }

        if (obj.inventory.FIELD_BOTTLE4 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE4 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE4 = obj.inventory.FIELD_BOTTLE4;
        }

        if (obj.inventory.FIELD_BOTTLE5 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE5 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE5 = obj.inventory.FIELD_BOTTLE5;
        }

        if (obj.inventory.FIELD_BOTTLE6 !== InventoryItem.NONE && storage.inventory.FIELD_BOTTLE6 === InventoryItem.NONE) {
          storage.inventory.FIELD_BOTTLE6 = obj.inventory.FIELD_BOTTLE4;
        }

        this.processMixedLoop(obj.inventory, storage.inventory, ["FIELD_BOTTLE1", "FIELD_BOTTLE2", "FIELD_BOTTLE3", "FIELD_BOTTLE4", "FIELD_BOTTLE3", "FIELD_BOTTLE4", "FIELD_BOTTLE5", "FIELD_BOTTLE6"]);

        if (storage.questStatus.heartPieceCount >= 3 && obj.questStatus.heartPieceCount === 0) {
          storage.questStatus.heartPieceCount = 0;
        }

        //let permSceneData = storage.permSceneData;
        //let weekEventFlags = storage.weekEventFlags;
        //let infTable = storage.infTable;

        /* for (let i = 0; i < obj.permSceneData.byteLength; i += 0x1C) {
          let struct = new SceneStruct(obj.permSceneData.slice(i, i + 0x1C));
          let cur = new SceneStruct(permSceneData.slice(i, i + 0x1C));
          for (let j = 0; j < struct.chests.byteLength; j++) {
            if (struct.chests[j] !== cur.chests[j]) {
              cur.chests[j] |= struct.chests[j];
            }
          }
          for (let j = 0; j < struct.collectible.byteLength; j++) {
            if (struct.collectible[j] !== cur.collectible[j]) {
              cur.collectible[j] |= struct.collectible[j];
            }
          }
          for (let j = 0; j < struct.room_clear.byteLength; j++) {
            if (struct.room_clear[j] !== cur.room_clear[j]) {
              cur.room_clear[j] |= struct.room_clear[j];
            }
          }
          for (let j = 0; j < struct.switches.byteLength; j++) {
            if (struct.switches[j] !== cur.switches[j]) {
              cur.switches[j] |= struct.switches[j];
            }
          }
          for (let j = 0; j < struct.visited_floors.byteLength; j++) {
            if (struct.visited_floors[j] !== cur.visited_floors[j]) {
              cur.visited_floors[j] |= struct.visited_floors[j];
            }
          }
          for (let j = 0; j < struct.visited_rooms.byteLength; j++) {
            if (struct.visited_rooms[j] !== cur.visited_rooms[j]) {
              cur.visited_rooms[j] |= struct.visited_rooms[j];
            }
          }
          for (let j = 0; j < struct.unused.byteLength; j++) {
            if (struct.unused[j] !== cur.unused[j]) {
              cur.unused[j] |= struct.unused[j];
            }
          }
        }
        for (let i = 0; i < obj.infTable.byteLength; i++) {
          let value = obj.infTable.readUInt8(i);
          if (infTable[i] !== value) {
            infTable[i] |= value;
          }
        }
        
        storage.permSceneData = permSceneData;
        storage.weekEventFlags = weekEventFlags;
        storage.infTable = infTable; */

        if (side === ProxySide.CLIENT) {
          //let cur = this.core.save.dungeonItemManager.getRawBuffer();
          //parseFlagChanges(obj.dungeon_items, cur);
          //this.core.save.dungeonItemManager.setRawBuffer(cur);
          //bus.emit(Z64OnlineEvents.ON_INVENTORY_UPDATE, {});
        } else {
          //parseFlagChanges(obj.dungeon_items, storage.dungeon_items);
        }
        accept(true);
      }).catch((err: string) => {
        reject(false);
      });
    });
  }

  applySave(save: Buffer) {
    this.mergeSave(save, this.core.save as any, ProxySide.CLIENT);
  }

}