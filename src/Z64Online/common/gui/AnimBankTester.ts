import { IModLoaderAPI } from "modloader64_api/IModLoaderAPI";
import { IZ64Main } from "Z64Lib/API/Common/IZ64Main";
import { ListBoxData } from "./ListBoxData";
import path from 'path';
import fs from 'fs';
import { number_ref } from "modloader64_api/Sylvain/ImGui";
import { bus } from "modloader64_api/EventHandler";
import { Z64OnlineEvents, Z64_AnimationBank } from "../api/Z64API";

export default class AnimBankTester{
    ModLoader: IModLoaderAPI;
    core: IZ64Main;
    isOpen: boolean = false;
    private banks: ListBoxData[] = [];
    private current: number_ref = [0];

    constructor(ModLoader: IModLoaderAPI, core: IZ64Main) {
        this.ModLoader = ModLoader;
        this.core = core;
    }

    onVi() {
        if (!this.isOpen) return;
        if (this.ModLoader.ImGui.begin("ANIM BANK TESTER")){
            if (this.banks.length === 0){
                this.ModLoader.ImGui.text(`Put .zdata in ${path.resolve(global.ModLoader.startdir, "banks")} to get started.`);
                let d = path.resolve(global.ModLoader.startdir, "banks");
                if (!fs.existsSync(d)){
                    fs.mkdirSync(d);
                }
                fs.readdirSync(d).forEach((f: string) => {
                    let file = path.resolve(d, f);
                    if (fs.existsSync(file) && !fs.lstatSync(file).isDirectory()) {
                        let parse = path.parse(file);
                        if (parse.ext === ".zdata") {
                            this.banks.push(new ListBoxData(file));
                        }
                    }
                });
            }else{
                if (this.ModLoader.ImGui.listBox("banks", this.current, this.banks)) {
                }
                this.ModLoader.ImGui.sameLine();
                if (this.ModLoader.ImGui.smallButton("Refresh List")) {
                    this.banks.length = 0;
                }
                if (this.ModLoader.ImGui.smallButton("Load Bank")) {
                    bus.emit(Z64OnlineEvents.FORCE_CUSTOM_ANIMATION_BANK, new Z64_AnimationBank("Tester", fs.readFileSync(this.banks[this.current[0]]._path)));
                }
            }
            this.ModLoader.ImGui.end();
        }
    }
}