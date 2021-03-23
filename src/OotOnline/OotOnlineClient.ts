import { InjectCore } from 'modloader64_api/CoreInjection';
import { bus, EventHandler, EventsClient } from 'modloader64_api/EventHandler';
import { INetworkPlayer, LobbyData, NetworkHandler } from 'modloader64_api/NetworkHandler';
import { IOOTCore, OotEvents, InventoryItem, Magic, MagicQuantities, Age, IInventory, IOvlPayloadResult, LinkState, SceneStruct } from 'modloader64_api/OOT/OOTAPI';
import { Z64OnlineEvents, Z64_PlayerScene } from './Z64API/OotoAPI';
import { ActorHookingManagerClient } from './data/ActorHookingSystem';
import path from 'path';
import { GUITunnelPacket } from 'modloader64_api/GUITunnel';
import fs from 'fs';
import { OotOnlineStorageClient } from './OotOnlineStorageClient';
import { DiscordStatus } from 'modloader64_api/Discord';
import { UtilityActorHelper } from './data/utilityActorHelper';
import { ModelManagerClient } from './data/models/ModelManager';
import { ModLoaderAPIInject } from 'modloader64_api/ModLoaderAPIInjector';
import { Init, Preinit, Postinit, onTick, onCreateResources } from 'modloader64_api/PluginLifecycle';
import { parseFlagChanges } from './parseFlagChanges';
import { IOotOnlineLobbyConfig, OotOnlineConfigCategory } from './OotOnline';
import { IModLoaderAPI, ModLoaderEvents } from 'modloader64_api/IModLoaderAPI';
import { ModelPlayer } from './data/models/ModelPlayer';
import { Command } from 'modloader64_api/OOT/ICommandBuffer';
import { Z64RomTools } from 'Z64Lib/API/Z64RomTools';
import { IActor } from 'modloader64_api/OOT/IActor';
import { KeyLogManagerClient } from './data/keys/KeyLogManager';
import { PuppetOverlordClient } from './data/linkPuppet/PuppetOverlord';
import { SidedProxy, ProxySide } from 'modloader64_api/SidedProxy/SidedProxy';
import { RPCClient } from './data/RPCHandler';
import { SoundManagerClient } from './data/sounds/SoundManager';
import { Z64LibSupportedGames } from 'Z64Lib/API/Z64LibSupportedGames';
import { ImGuiHandler } from './gui/imgui/ImGuiHandler';
import { addToKillFeedQueue } from 'modloader64_api/Announcements';
import { Texture } from 'modloader64_api/Sylvain/Gfx';
import { WorldEvents } from './WorldEvents/WorldEvents';
import { EmoteManager } from './data/emotes/emoteManager';
import { OotOSaveData } from './data/OotoSaveData';
import { Ooto_BottleUpdatePacket, Ooto_ClientSceneContextUpdate, Ooto_DownloadRequestPacket, Ooto_DownloadResponsePacket, OotO_isRandoPacket, OotO_ItemGetMessagePacket, Ooto_ScenePacket, Ooto_SceneRequestPacket, OotO_UpdateSaveDataPacket } from './data/OotOPackets';

export let GHOST_MODE_TRIGGERED: boolean = false;

export class OotOnlineClient {
    @InjectCore()
    core!: IOOTCore;

    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;

    LobbyConfig: IOotOnlineLobbyConfig = {} as IOotOnlineLobbyConfig;
    clientStorage: OotOnlineStorageClient = new OotOnlineStorageClient();
    config!: OotOnlineConfigCategory;

    @SidedProxy(ProxySide.CLIENT, EmoteManager)
    emotes!: EmoteManager;
    @SidedProxy(ProxySide.CLIENT, ModelManagerClient)
    modelManager!: ModelManagerClient;
    @SidedProxy(ProxySide.CLIENT, UtilityActorHelper)
    utility!: UtilityActorHelper;
    @SidedProxy(ProxySide.CLIENT, ActorHookingManagerClient)
    actorHooks!: ActorHookingManagerClient;
    @SidedProxy(ProxySide.CLIENT, KeyLogManagerClient)
    keys!: KeyLogManagerClient;
    @SidedProxy(ProxySide.CLIENT, PuppetOverlordClient)
    puppets!: PuppetOverlordClient;
    @SidedProxy(ProxySide.CLIENT, RPCClient)
    rcp!: RPCClient;
    @SidedProxy(ProxySide.CLIENT, SoundManagerClient)
    sound!: SoundManagerClient;
    @SidedProxy(ProxySide.CLIENT, ImGuiHandler)
    gui!: ImGuiHandler;
    @SidedProxy(ProxySide.CLIENT, WorldEvents)
    worldEvents!: WorldEvents;
    resourcesLoaded: boolean = false;
    itemIcons: Map<string, Texture> = new Map<string, Texture>();

    @onCreateResources()
    onResource() {
        if (!this.resourcesLoaded) {
            let base: string = path.resolve(__dirname, "gui", "sprites");
            fs.readdirSync(base).forEach((file: string) => {
                let p = path.resolve(base, file);
                let t: Texture = this.ModLoader.Gfx.createTexture();
                t.loadFromFile(p);
                this.itemIcons.set(file, t);
                //this.ModLoader.logger.debug("Loaded " + file + ".");
            });
            this.resourcesLoaded = true;
        }
    }

    @EventHandler(Z64OnlineEvents.GHOST_MODE)
    onGhostInstruction(evt: any) {
        this.LobbyConfig.actor_syncing = false;
        this.LobbyConfig.data_syncing = false;
        this.clientStorage.first_time_sync = true;
        this.LobbyConfig.key_syncing = false;
        GHOST_MODE_TRIGGERED = true;
    }

    @Preinit()
    preinit() {
        this.config = this.ModLoader.config.registerConfigCategory("OotOnline") as OotOnlineConfigCategory;
        this.ModLoader.config.setData("OotOnline", "mapTracker", false);
        this.ModLoader.config.setData("OotOnline", "keySync", true);
        this.ModLoader.config.setData("OotOnline", "notifications", true);
        this.ModLoader.config.setData("OotOnline", "nameplates", true);
        this.gui.settings = this.config;
    }

    @Init()
    init(): void {
        if (this.modelManager !== undefined) {
            this.modelManager.clientStorage = this.clientStorage;
            if (this.gui !== undefined) {
                this.gui.modelManager = this.modelManager;
            }
        }
    }

    @Postinit()
    postinit() {
        if (this.config.mapTracker) {
            this.ModLoader.gui.openWindow(698, 805, path.resolve(path.join(__dirname, 'gui', 'map.html')));
        }
        this.clientStorage.scene_keys = JSON.parse(fs.readFileSync(__dirname + '/data/scene_numbers.json').toString());
        this.clientStorage.localization = JSON.parse(fs.readFileSync(__dirname + '/data/en_US.json').toString());
        let status: DiscordStatus = new DiscordStatus('Playing OotOnline', 'On the title screen');
        status.smallImageKey = 'ooto';
        status.partyId = this.ModLoader.clientLobby;
        status.partyMax = 30;
        status.partySize = 1;
        this.ModLoader.gui.setDiscordStatus(status);
    }

    updateInventory() {
        this.clientStorage.needs_update = false;
        let data = new OotOSaveData(this.core, this.ModLoader);
        let save = data.createSave();
        this.ModLoader.clientSide.sendPacket(new OotO_UpdateSaveDataPacket(this.ModLoader.clientLobby, save));
    }

    autosaveSceneData() {
        if (!this.core.helper.isLinkEnteringLoadingZone() &&
            this.core.global.scene_framecount > 20) {
            if (this.ModLoader.emulator.rdramRead8(0x80600144) === 0x1) {
                return;
            }
            let live_scene_chests: Buffer = this.core.global.liveSceneData_chests;
            let live_scene_switches: Buffer = this.core.global.liveSceneData_switch;
            let live_scene_collect: Buffer = this.core.global.liveSceneData_collectable;
            let live_scene_clear: Buffer = this.core.global.liveSceneData_clear;
            let live_scene_temp: Buffer = this.core.global.liveSceneData_temp;
            let save_scene_data: Buffer = this.core.global.getSaveDataForCurrentScene();
            let save: Buffer = Buffer.alloc(0x1c);
            live_scene_chests.copy(save, 0x0); // Chests
            live_scene_switches.copy(save, 0x4); // Switches
            live_scene_clear.copy(save, 0x8); // Room Clear
            live_scene_collect.copy(save, 0xc); // Collectables
            live_scene_temp.copy(save, 0x10); // Unused space.
            save_scene_data.copy(save, 0x14, 0x14, 0x18); // Visited Rooms.
            save_scene_data.copy(save, 0x18, 0x18, 0x1c); // Visited Rooms.
            let save_hash_2: string = this.ModLoader.utils.hashBuffer(save);
            if (save_hash_2 !== this.clientStorage.autoSaveHash) {
                this.ModLoader.logger.info('autosaveSceneData()');
                save_scene_data.copy(save, 0x10, 0x10, 0x14);
                for (let i = 0; i < save_scene_data.byteLength; i++) {
                    save_scene_data[i] |= save[i];
                }
                this.clientStorage.autoSaveHash = save_hash_2;
            }
            else {
                return;
            }
            this.core.global.writeSaveDataForCurrentScene(save_scene_data);
            this.ModLoader.clientSide.sendPacket(new Ooto_ClientSceneContextUpdate(live_scene_chests, live_scene_switches, live_scene_collect, live_scene_clear, live_scene_temp, this.ModLoader.clientLobby, this.core.global.scene));
        }
    }

    updateBottles(onlyfillCache = false) {
        let bottles: InventoryItem[] = [
            this.core.save.inventory.bottle_1,
            this.core.save.inventory.bottle_2,
            this.core.save.inventory.bottle_3,
            this.core.save.inventory.bottle_4,
        ];
        for (let i = 0; i < bottles.length; i++) {
            if (bottles[i] !== this.clientStorage.bottleCache[i]) {
                this.clientStorage.bottleCache[i] = bottles[i];
                this.ModLoader.logger.info('Bottle update.');
                if (!onlyfillCache) {
                    this.ModLoader.clientSide.sendPacket(new Ooto_BottleUpdatePacket(i, bottles[i], this.ModLoader.clientLobby));
                }
            }
        }
    }

    updateSkulltulas() {
    }

    @EventHandler(OotEvents.ON_SAVE_LOADED)
    onSaveLoaded(evt: any) {
        let test = false;
        if (test) {
            this.core.save.permSceneData = this.ModLoader.utils.clearBuffer(this.core.save.permSceneData);
        }
        setTimeout(() => {
            if (this.LobbyConfig.data_syncing) {
                this.ModLoader.clientSide.sendPacket(new Ooto_DownloadRequestPacket(this.ModLoader.clientLobby, new OotOSaveData(this.core, this.ModLoader).createSave()));
            }
        }, 1000);
    }

    //------------------------------
    // Lobby Setup
    //------------------------------
    @EventHandler(EventsClient.CONFIGURE_LOBBY)
    onLobbySetup(lobby: LobbyData): void {
        lobby.data['OotOnline:data_syncing'] = true;
        lobby.data['OotOnline:actor_syncing'] = true;
        lobby.data['OotOnline:key_syncing'] = this.config.keySync;
    }

    @EventHandler(EventsClient.ON_LOBBY_JOIN)
    onJoinedLobby(lobby: LobbyData): void {
        this.LobbyConfig.actor_syncing = lobby.data['OotOnline:actor_syncing'];
        this.LobbyConfig.data_syncing = lobby.data['OotOnline:data_syncing'];
        this.LobbyConfig.key_syncing = lobby.data['OotOnline:key_syncing'];
        this.ModLoader.logger.info('OotOnline settings inherited from lobby.');
        if (GHOST_MODE_TRIGGERED) {
            bus.emit(Z64OnlineEvents.GHOST_MODE, true);
        }
    }

    @EventHandler(EventsClient.ON_PLAYER_LEAVE)
    onPlayerLeft(player: INetworkPlayer) {
        this.ModLoader.gui.tunnel.send('OotOnline:onPlayerLeft', new GUITunnelPacket('OotOnline', 'OotOnline:onPlayerLeft', player));
    }

    //------------------------------
    // Scene handling
    //------------------------------

    @EventHandler(OotEvents.ON_SCENE_CHANGE)
    onSceneChange(scene: number) {
        this.ModLoader.clientSide.sendPacket(
            new Ooto_ScenePacket(
                this.ModLoader.clientLobby,
                scene,
                this.core.save.age
            )
        );
        this.ModLoader.logger.info('client: I moved to scene ' + scene + '.');
        if (this.core.helper.isSceneNumberValid()) {
            this.ModLoader.gui.setDiscordStatus(
                new DiscordStatus(
                    'Playing OotOnline',
                    'In ' +
                    this.clientStorage.localization[
                    this.clientStorage.scene_keys[scene]
                    ]
                )
            );
        }
    }

    @EventHandler(OotEvents.ON_ROOM_CHANGE)
    onRoomChange(room: number) {
        this.ModLoader.gui.tunnel.send(
            'OotOnline:onRoomChanged',
            new GUITunnelPacket('OotOnline', 'OotOnline:onRoomChanged', room)
        );
    }

    @NetworkHandler('Ooto_ScenePacket')
    onSceneChange_client(packet: Ooto_ScenePacket) {
        this.ModLoader.logger.info(
            'client receive: Player ' +
            packet.player.nickname +
            ' moved to scene ' +
            this.clientStorage.localization[
            this.clientStorage.scene_keys[packet.scene]
            ] +
            '.'
        );
        bus.emit(
            Z64OnlineEvents.CLIENT_REMOTE_PLAYER_CHANGED_SCENES,
            new Z64_PlayerScene(packet.player, packet.lobby, packet.scene)
        );
    }

    // This packet is basically 'where the hell are you?' if a player has a puppet on file but doesn't know what scene its suppose to be in.
    @NetworkHandler('Ooto_SceneRequestPacket')
    onSceneRequest_client(packet: Ooto_SceneRequestPacket) {
        if (this.core.save !== undefined) {
            this.ModLoader.clientSide.sendPacketToSpecificPlayer(
                new Ooto_ScenePacket(
                    this.ModLoader.clientLobby,
                    this.core.global.scene,
                    this.core.save.age
                ),
                packet.player
            );
        }
    }

    @NetworkHandler('Ooto_BottleUpdatePacket')
    onBottle_client(packet: Ooto_BottleUpdatePacket) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNumberValid()
        ) {
            return;
        }
        this.clientStorage.bottleCache[packet.slot] = packet.contents;
        let inventory = this.core.save.inventory;
        switch (packet.slot) {
            case 0:
                inventory.bottle_1 = packet.contents;
                break;
            case 1:
                inventory.bottle_2 = packet.contents;
                break;
            case 2:
                inventory.bottle_3 = packet.contents;
                break;
            case 3:
                inventory.bottle_4 = packet.contents;
                break;
        }
        bus.emit(Z64OnlineEvents.ON_INVENTORY_UPDATE, this.core.save.inventory);
    }

    // The server is giving me data.
    @NetworkHandler('Ooto_DownloadResponsePacket')
    onDownloadPacket_client(packet: Ooto_DownloadResponsePacket) {
        if (!packet.host) {
            if (packet.save) {
                let s = new OotOSaveData(this.core, this.ModLoader);
                s.applySave(packet.save!);
            }
        } else {
            this.ModLoader.logger.info("The lobby is mine!");
        }
        this.clientStorage.first_time_sync = true;
    }

    @NetworkHandler('OotO_UpdateSaveDataPacket')
    onSaveUpdate(packet: OotO_UpdateSaveDataPacket) {
        let data = new OotOSaveData(this.core, this.ModLoader);
        data.applySave(packet.save);
    }

    @NetworkHandler('Ooto_ClientSceneContextUpdate')
    onSceneContextSync_client(packet: Ooto_ClientSceneContextUpdate) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNumberValid() ||
            this.core.helper.isLinkEnteringLoadingZone()
        ) {
            return;
        }
        if (this.core.global.scene !== packet.scene) {
            return;
        }
        let buf1: Buffer = this.core.global.liveSceneData_chests;
        if (Object.keys(parseFlagChanges(packet.chests, buf1) > 0)) {
            this.core.global.liveSceneData_chests = buf1;
        }

        let buf2: Buffer = this.core.global.liveSceneData_switch;
        if (Object.keys(parseFlagChanges(packet.switches, buf2) > 0)) {
            this.core.global.liveSceneData_switch = buf2;
        }

        let buf3: Buffer = this.core.global.liveSceneData_collectable;
        if (Object.keys(parseFlagChanges(packet.collect, buf3) > 0)) {
            this.core.global.liveSceneData_collectable = buf3;
        }

        let buf4: Buffer = this.core.global.liveSceneData_clear;
        if (Object.keys(parseFlagChanges(packet.clear, buf4) > 0)) {
            this.core.global.liveSceneData_clear = buf4;
        }

        let buf5: Buffer = this.core.global.liveSceneData_temp;
        if (Object.keys(parseFlagChanges(packet.temp, buf5) > 0)) {
            this.core.global.liveSceneData_temp = buf5;
        }
    }

    @NetworkHandler("OotO_ItemGetMessagePacket")
    onMessage(packet: OotO_ItemGetMessagePacket) {
        this.clientStorage.notifBuffer.push(packet);
    }

    healPlayer() {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNumberValid()
        ) {
            return;
        }
        this.ModLoader.emulator.rdramWrite16(
            global.ModLoader.save_context + 0x1424,
            0x65
        );
    }

    @EventHandler(Z64OnlineEvents.GAINED_PIECE_OF_HEART)
    onNeedsHeal1(evt: any) {
        this.healPlayer();
    }

    @EventHandler(Z64OnlineEvents.GAINED_HEART_CONTAINER)
    onNeedsHeal2(evt: any) {
        this.healPlayer();
    }

    @EventHandler(Z64OnlineEvents.MAGIC_METER_INCREASED)
    onNeedsMagic(size: Magic) {
        switch (size) {
            case Magic.NONE:
                this.core.save.magic_current = MagicQuantities.NONE;
                break;
            case Magic.NORMAL:
                this.core.save.magic_current = MagicQuantities.NORMAL;
                break;
            case Magic.EXTENDED:
                this.core.save.magic_current = MagicQuantities.EXTENDED;
                break;
        }
    }

    @EventHandler(OotEvents.ON_AGE_CHANGE)
    onAgeChange(age: Age) {
        this.ModLoader.clientSide.sendPacket(
            new Ooto_ScenePacket(
                this.ModLoader.clientLobby,
                this.core.global.scene,
                age
            )
        );
    }

    private isBottle(item: InventoryItem) {
        return (item === InventoryItem.EMPTY_BOTTLE || item === InventoryItem.BOTTLED_BIG_POE || item === InventoryItem.BOTTLED_BUGS || item === InventoryItem.BOTTLED_FAIRY || item === InventoryItem.BOTTLED_FISH || item === InventoryItem.BOTTLED_POE || item === InventoryItem.LON_LON_MILK || item === InventoryItem.LON_LON_MILK_HALF)
    }

    @EventHandler(Z64OnlineEvents.ON_INVENTORY_UPDATE)
    onInventoryUpdate(inventory: IInventory) {
        if (
            this.core.helper.isTitleScreen() ||
            !this.core.helper.isSceneNumberValid()
        ) {
            return;
        }

        let addr: number = global.ModLoader.save_context + 0x0068;
        let buf: Buffer = this.ModLoader.emulator.rdramReadBuffer(addr, 0x7);
        let addr2: number = global.ModLoader.save_context + 0x0074;
        let raw_inventory: Buffer = this.ModLoader.emulator.rdramReadBuffer(
            addr2,
            0x24
        );
        if (buf[0x4] !== InventoryItem.NONE && raw_inventory[buf[0x4]] !== InventoryItem.NONE && (raw_inventory[buf[0x4]] === InventoryItem.HOOKSHOT || this.isBottle(raw_inventory[buf[0x4]]))) {
            buf[0x1] = raw_inventory[buf[0x4]];
            this.ModLoader.emulator.rdramWriteBuffer(addr, buf);
            this.core.commandBuffer.runCommand(
                Command.UPDATE_C_BUTTON_ICON,
                0x00000001,
                (success: boolean, result: number) => { }
            );
        }
        if (buf[0x5] !== InventoryItem.NONE && raw_inventory[buf[0x5]] !== InventoryItem.NONE && (raw_inventory[buf[0x5]] === InventoryItem.HOOKSHOT || this.isBottle(raw_inventory[buf[0x5]]))) {
            buf[0x2] = raw_inventory[buf[0x5]];
            this.ModLoader.emulator.rdramWriteBuffer(addr, buf);
            this.core.commandBuffer.runCommand(
                Command.UPDATE_C_BUTTON_ICON,
                0x00000002,
                (success: boolean, result: number) => { }
            );
        }
        if (buf[0x6] !== InventoryItem.NONE && raw_inventory[buf[0x6]] !== InventoryItem.NONE && (raw_inventory[buf[0x6]] === InventoryItem.HOOKSHOT || this.isBottle(raw_inventory[buf[0x6]]))) {
            buf[0x3] = raw_inventory[buf[0x6]];
            this.ModLoader.emulator.rdramWriteBuffer(addr, buf);
            this.core.commandBuffer.runCommand(
                Command.UPDATE_C_BUTTON_ICON,
                0x00000003,
                (success: boolean, result: number) => { }
            );
        }
    }

    @EventHandler(ModLoaderEvents.ON_CRASH)
    onEmuCrash(evt: any) {
        fs.writeFileSync(
            './Ooto_storagedump.json',
            JSON.stringify(this.clientStorage, null, 2)
        );
        this.utility.makeRamDump();
    }

    @EventHandler(EventsClient.ON_PAYLOAD_INJECTED)
    onPayload(evt: any) {
        if (path.parse(evt.file).ext === ".ovl") {
            let result: IOvlPayloadResult = evt.result;
            this.clientStorage.overlayCache[evt.file] = result;
        }
        if (evt.file === "puppet.ovl") {
            let result: IOvlPayloadResult = evt.result;
            this.ModLoader.emulator.rdramWrite32(0x80600140, result.params);
        } else if (evt.file === "flag_fixer.ovl") {
            let result: IOvlPayloadResult = evt.result;
            this.ModLoader.emulator.rdramWrite32(0x80600150, result.params);
        }
    }

    @EventHandler(EventsClient.ON_INJECT_FINISHED)
    onStartupFinished(evt: any) {
        //this.core.toggleMapSelectKeybind();
    }

    @EventHandler(ModLoaderEvents.ON_ROM_PATCHED)
    onRom(evt: any) {
        try {
            let expected_hash: string = "34c6b74de175cb3d5d08d8428e7ab21d";
            let tools: Z64RomTools = new Z64RomTools(this.ModLoader, global.ModLoader.isDebugRom ? Z64LibSupportedGames.DEBUG_OF_TIME : Z64LibSupportedGames.OCARINA_OF_TIME);
            let file_select_ovl: Buffer = tools.decompressDMAFileFromRom(evt.rom, 0x0032);
            let hash: string = this.ModLoader.utils.hashBuffer(file_select_ovl);
            if (expected_hash !== hash) {
                this.ModLoader.logger.info("File select overlay is modified. Is this rando?");
                this.ModLoader.clientSide.sendPacket(new OotO_isRandoPacket(this.ModLoader.clientLobby));
            }
        } catch (err) { }
    }

    @EventHandler(ModLoaderEvents.ON_SOFT_RESET_PRE)
    onReset(evt: any) {
        this.clientStorage.first_time_sync = false;
    }

    // This spawns the helper actor to fix some flag issues.
    @EventHandler(OotEvents.ON_ACTOR_SPAWN)
    onActorSpawned(actor: IActor) {
        // 0x87 = Forest Temple Elevator.
        // 0x102 = Windmill Blades.
        // 0xF8 = Hyrule Castle Gate.
        // 0xCB = Ingo.
        if (actor.actorID === 0x0087 || actor.actorID === 0x102 || actor.actorID === 0xF8 || (actor.actorID === 0xCB && actor.variable === 0x2)) {
            (this.clientStorage.overlayCache["flag_fixer.ovl"] as IOvlPayloadResult).spawn((this.clientStorage.overlayCache["flag_fixer.ovl"] as IOvlPayloadResult), (success: boolean, result: number) => {
                let ff: IActor = this.core.actorManager.createIActorFromPointer(result);
                if (actor.actorID === 0x0087) {
                    ff.rdramWriteBuffer(0x24, Buffer.from("433B788243690000C4BAC599", 'hex'));
                } else if (actor.actorID === 0x102) {
                    ff.rdramWriteBuffer(0x24, Buffer.from("43751CE2432000004436C483", 'hex'));
                } else if (actor.actorID === 0xF8) {
                    ff.rdramWriteBuffer(0x24, Buffer.from("44130FE344CA2000C39B683C", 'hex'));
                } else if (actor.actorID === 0xCB && actor.variable === 0x2) {
                    ff.rdramWriteBuffer(0x24, Buffer.from('C31E000000000000C4C78000', 'hex'));
                }
                this.ModLoader.logger.debug("Summoning the bugfix actor...");
                return {};
            });
        }
    }

    @onTick()
    onTick() {
        if (
            !this.core.helper.isTitleScreen() &&
            this.core.helper.isSceneNumberValid()
        ) {
            if (!this.core.helper.isPaused()) {
                if (!this.clientStorage.first_time_sync) {
                    return;
                }
                if (this.LobbyConfig.actor_syncing) {
                    this.actorHooks.tick();
                }
                if (this.LobbyConfig.data_syncing) {
                    this.autosaveSceneData();
                    this.updateBottles();
                    this.updateSkulltulas();
                    if (this.LobbyConfig.key_syncing) {
                        this.keys.update();
                    }
                    let state = this.core.link.state;
                    if (state === LinkState.STANDING && this.clientStorage.notifBuffer.length > 0) {
                        if (this.clientStorage.notifBuffer.length > 10) {
                            let size = this.clientStorage.notifBuffer.length;
                            this.clientStorage.notifBuffer.length = 0;
                            this.clientStorage.notifBuffer.push(new OotO_ItemGetMessagePacket("You obtained " + size + " items.", this.ModLoader.clientLobby));
                        }
                        while (this.clientStorage.notifBuffer.length > 0) {
                            let packet = this.clientStorage.notifBuffer.shift()!;
                            if (this.config.notifications) {
                                if (packet.icon !== undefined) {
                                    addToKillFeedQueue(packet.text, this.itemIcons.get(packet.icon));
                                } else {
                                    addToKillFeedQueue(packet.text);
                                }
                            }
                        }
                    }
                    if (state === LinkState.BUSY || state === LinkState.GETTING_ITEM || state === LinkState.TALKING) {
                        this.clientStorage.needs_update = true;
                    } else if (
                        state === LinkState.STANDING &&
                        this.clientStorage.needs_update &&
                        this.LobbyConfig.data_syncing
                    ) {
                        this.updateInventory();
                        this.clientStorage.needs_update = false;
                    }
                }
            }
        }
    }
}
