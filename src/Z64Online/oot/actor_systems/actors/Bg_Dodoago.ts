import { ActorHookBase, HookInfo } from '../ActorHookBase';

class Bg_Dodoago extends ActorHookBase {
  constructor() {
    super();
    this.actorID = 0x003f;
  }
}

module.exports = new Bg_Dodoago();
