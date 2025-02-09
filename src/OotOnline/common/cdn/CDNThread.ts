import { parentPort } from 'worker_threads';
import { CDNData } from './ICDNData';
import path from 'path';
import { CDNConfirm_Packet, CDNFileDownload_Packet, CDNFileRequest_Packet, CDNFileUpload_Packet } from './CDNPackets';
import fs from 'fs-extra';
import zip from 'adm-zip';
import http, { IncomingMessage, ServerResponse } from 'http';
import { SmartBuffer } from 'smart-buffer';

class CDNThread {

    knownFiles: Map<string, string> = new Map<string, string>();
    pendingUploads: Map<string, SmartBuffer> = new Map<string, SmartBuffer>();
    server: http.Server;

    constructor() {
        try {
            fs.mkdirSync("./cdn");
            fs.mkdirSync("./cdn/files");
        } catch (err) {
        }
        fs.readdirSync("./cdn/files").forEach((f: string) => {
            let p = path.resolve("./cdn/files", f);
            if (fs.existsSync(p)) {
                this.knownFiles.set(path.parse(p).name, p);
            }
        });
        this.server = new http.Server((req: IncomingMessage, res: ServerResponse) => {
            fs.readFile(`./${req.url!}`, function (err, data) {
                if (err) {
                    res.writeHead(404);
                    res.end(JSON.stringify(err));
                    return;
                }
                res.writeHead(200);
                res.write(data);
                res.end();
            });
        });
        this.server.listen(6969);
        parentPort!.on('message', this.onMessageFromMainThread.bind(this));
    }

    hasFile(id: string) {
        return this.knownFiles.has(id);
    }

    handleRequest(packet: CDNFileRequest_Packet) {
        let resp: CDNFileRequest_Packet = new CDNFileRequest_Packet(packet.model_id);
        resp.has = this.hasFile(packet.model_id);
        resp.player = packet.player;
        this.sendMessageToMainThread(resp.packet_id, resp);
    }

    handleUpload(packet: CDNFileUpload_Packet) {
        if (!this.pendingUploads.has(packet.id)) {
            this.pendingUploads.set(packet.id, new SmartBuffer());
        }
        this.pendingUploads.get(packet.id)!.writeBuffer(packet.buf);
        if (packet.done) {
            let buf = this.pendingUploads.get(packet.id)!.toBuffer();
            let _zip = new zip();
            _zip.addFile(packet.id, buf);
            let p = path.resolve("./cdn/files/", `${packet.id}.zip`);
            fs.writeFile(p, _zip.toBuffer(), () => {
                this.knownFiles.set(packet.id, p);
                this.pendingUploads.delete(packet.id);
            });
        } else {
            let resp = new CDNConfirm_Packet(packet.id);
            resp.player = packet.player;
            this.sendMessageToMainThread('CDNConfirm_Packet', resp);
        }
    }

    handleDownload(packet: CDNFileDownload_Packet) {
        let resp = new CDNFileDownload_Packet(packet.model_id);
        resp.player = packet.player;
        resp.url = "http://127.0.0.1:6969/cdn/files/" + packet.model_id + ".zip";
        if (!this.knownFiles.has(packet.model_id)) {
            resp.error = true;
        }
        this.sendMessageToMainThread(resp.packet_id, resp);
    }

    private sendMessageToMainThread(id: string, packet: any) {
        parentPort!.postMessage(new CDNData(id, packet));
    }

    onMessageFromMainThread(p: CDNData) {
        switch (p.id) {
            case "CDNFileRequest_Packet":
                this.handleRequest(p.packet);
                break;
            case 'CDNFileUpload_Packet':
                p.packet.buf = Buffer.from(p.packet.buf);
                this.handleUpload(p.packet);
                break;
            case 'CDNFileDownload_Packet':
                this.handleDownload(p.packet);
                break;
        }
    }
}

const thread: CDNThread = new CDNThread();

// Tick tock keep the thread alive.
setInterval(() => { }, 1000);