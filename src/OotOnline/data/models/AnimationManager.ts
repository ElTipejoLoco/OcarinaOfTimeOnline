import { Z64OnlineEvents, Z64_AnimationBank } from "@OotOnline/Z64API/OotoAPI";
import { InjectCore } from "modloader64_api/CoreInjection";
import { EventHandler } from "modloader64_api/EventHandler";
import { IModLoaderAPI, ModLoaderEvents } from "modloader64_api/IModLoaderAPI";
import { IOOTCore } from "modloader64_api/OOT/OOTAPI";
import { Init } from "modloader64_api/PluginLifecycle";
import { Z64LibSupportedGames } from "Z64Lib/API/Z64LibSupportedGames";
import { Z64RomTools } from "Z64Lib/API/Z64RomTools";
import { OOTO_PRIVATE_EVENTS } from "../InternalAPI";
import { ModLoaderAPIInject } from "modloader64_api/ModLoaderAPIInjector";

export default class AnimationManager{

    @ModLoaderAPIInject()
    ModLoader!: IModLoaderAPI;
    @InjectCore()
    core!: IOOTCore;
    //---
    banks: Map<string, Buffer> = new Map<string, Buffer>();
    animationBankAddress: number = -1;
    vanillaBank!: Buffer;

    @EventHandler(Z64OnlineEvents.CUSTOM_ANIMATION_BANK_REGISTER)
    onRegister(evt: Z64_AnimationBank){
        this.banks.set(evt.name, evt.bank);
    }

    @Init()
    onInit(){
        this.ModLoader.privateBus.emit(OOTO_PRIVATE_EVENTS.REGISTER_ANIM_BANKS_WITH_COSTUME_MANAGER, this.banks);
    }

    @EventHandler(ModLoaderEvents.ON_ROM_PATCHED)
    onRom(evt: any){
        let rom: Buffer = evt.rom;
        let tools: Z64RomTools = new Z64RomTools(this.ModLoader, global.ModLoader.isDebugRom ? Z64LibSupportedGames.DEBUG_OF_TIME : Z64LibSupportedGames.OCARINA_OF_TIME);
        let bank: Buffer = tools.decompressDMAFileFromRom(rom, 7);
        this.vanillaBank = bank;
        this.animationBankAddress = tools.relocateFileToExtendedRom(rom, 7, bank, bank.byteLength, true);
        tools.noCRC(rom);
    }

    @EventHandler(Z64OnlineEvents.FORCE_CUSTOM_ANIMATION_BANK)
    onApply(evt: Z64_AnimationBank){
        if (evt.bank.byteLength === 1){
            this.ModLoader.rom.romWriteBuffer(this.animationBankAddress, this.vanillaBank);
        }else{
            this.ModLoader.rom.romWriteBuffer(this.animationBankAddress, evt.bank);
        }
    }

}