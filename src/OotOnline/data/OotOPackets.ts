import {
  Packet,
  packetHelper,
  UDPPacket,
} from 'modloader64_api/ModLoaderDefaultImpls';
import { PuppetData } from './linkPuppet/PuppetData';
import {
  Age,
  InventoryItem,
} from 'modloader64_api/OOT/OOTAPI';
import { ActorPacketData } from './ActorHookBase';
import { HorseData } from './linkPuppet/HorseData';
import { INetworkPlayer } from 'modloader64_api/NetworkHandler';

export class Ooto_PuppetPacket {
  data: PuppetData;
  horse_data!: HorseData;

  constructor(puppetData: PuppetData, lobby: string) {
    this.data = puppetData;
  }

  setHorseData(horse: HorseData) {
    this.horse_data = horse;
  }
}

export class Ooto_PuppetWrapperPacket extends UDPPacket {

  data: string;

  constructor(packet: Ooto_PuppetPacket, lobby: string) {
    super('Ooto_PuppetPacket', 'OotOnline', lobby, false);
    this.data = JSON.stringify(packet);
  }
}

export class Ooto_ScenePacket extends Packet {
  scene: number;
  age: Age;

  constructor(lobby: string, scene: number, age: Age) {
    super('Ooto_ScenePacket', 'OotOnline', lobby, true);
    this.scene = scene;
    this.age = age;
  }
}

export class Ooto_SceneRequestPacket extends Packet {
  constructor(lobby: string) {
    super('Ooto_SceneRequestPacket', 'OotOnline', lobby, true);
  }
}

export class Ooto_BankSyncPacket extends Packet {
  savings: number;

  constructor(saving: number, lobby: string) {
    super('Ooto_BankSyncPacket', 'OotOnline', lobby, true);
    this.savings = saving;
  }
}

export class Ooto_DownloadResponsePacket extends Packet {

  save?: Buffer;
  host: boolean;

  constructor(lobby: string, host: boolean) {
    super('Ooto_DownloadResponsePacket', 'OotOnline', lobby, false);
    this.host = host;
  }
}

export class Ooto_DownloadRequestPacket extends Packet {

  save: Buffer;

  constructor(lobby: string, save: Buffer) {
    super('Ooto_DownloadRequestPacket', 'OotOnline', lobby, false);
    this.save = save;
  }
}

export class OotO_UpdateSaveDataPacket extends Packet{

  save: Buffer;

  constructor(lobby: string, save: Buffer){
    super('OotO_UpdateSaveDataPacket', 'OotOnline', lobby, false);
    this.save = save;
  }
}

export class Ooto_ClientSceneContextUpdate extends Packet {
  chests: Buffer;
  switches: Buffer;
  collect: Buffer;
  clear: Buffer;
  temp: Buffer;
  scene: number;

  constructor(
    chests: Buffer,
    switches: Buffer,
    collect: Buffer,
    clear: Buffer,
    temp: Buffer,
    lobby: string,
    scene: number
  ) {
    super('Ooto_ClientSceneContextUpdate', 'OotOnline', lobby, false);
    this.chests = chests;
    this.switches = switches;
    this.collect = collect;
    this.clear = clear;
    this.temp = temp;
    this.scene = scene;
  }
}

export class Ooto_ActorPacket extends Packet {
  actorData: ActorPacketData;
  scene: number;
  room: number;

  constructor(
    data: ActorPacketData,
    scene: number,
    room: number,
    lobby: string
  ) {
    super('Ooto_ActorPacket', 'OotOnline', lobby, true);
    this.actorData = data;
    this.scene = scene;
    this.room = room;
  }
}

export class Ooto_ActorDeadPacket extends Packet {
  actorUUID: string;
  scene: number;
  room: number;

  constructor(aid: string, scene: number, room: number, lobby: string) {
    super('Ooto_ActorDeadPacket', 'OotOnline', lobby, true);
    this.actorUUID = aid;
    this.scene = scene;
    this.room = room;
  }
}

export class Ooto_SpawnActorPacket extends Packet {
  actorData: ActorPacketData;
  room: number;
  scene: number;
  constructor(
    data: ActorPacketData,
    scene: number,
    room: number,
    lobby: string
  ) {
    super('Ooto_SpawnActorPacket', 'OotOnline', lobby, true);
    this.actorData = data;
    this.scene = scene;
    this.room = room;
  }
}

export class Ooto_BottleUpdatePacket extends Packet {
  slot: number;
  contents: InventoryItem;

  constructor(slot: number, contents: InventoryItem, lobby: string) {
    super('Ooto_BottleUpdatePacket', 'OotOnline', lobby, true);
    this.slot = slot;
    this.contents = contents;
  }
}

export class Ooto_SceneGUIPacket extends Packet {
  scene: number;
  age: Age;
  iconAdult!: string;
  iconChild!: string;

  constructor(
    scene: number,
    age: Age,
    lobby: string,
    iconAdult?: Buffer,
    iconChild?: Buffer
  ) {
    super('Ooto_SceneGUIPacket', 'OotOnline', lobby, false);
    this.scene = scene;
    this.age = age;
    if (iconAdult !== undefined) {
      this.iconAdult = iconAdult.toString('base64');
    }
    if (iconChild !== undefined) {
      this.iconChild = iconChild.toString('base64');
    }
  }

  setAdultIcon(iconAdult: Buffer) {
    this.iconAdult = iconAdult.toString('base64');
  }

  setChildIcon(iconChild: Buffer) {
    this.iconChild = iconChild.toString('base64');
  }
}

export class OotO_isRandoPacket extends Packet {

  isRando: boolean = true;

  constructor(lobby: string) {
    super("OotO_isRandoPacket", "OotOnline", lobby, false);
  }
}

export class OotO_ItemGetMessagePacket extends Packet {
  text: string;
  icon?: string;
  constructor(text: string, lobby: string, icon?: string) {
    super('OotO_ItemGetMessagePacket', 'OotOnline', lobby, true);
    this.text = text;
    this.icon = icon;
  }
}