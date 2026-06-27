const { WebSocketServer } = require("ws");
const pty = require("node-pty");
const config = require("./config");
const app = require("./app");

const PORT = process.env.PORT || config.PORT || 8089;

function startServer(port) {
  const server = app.listen(port);
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${port} in use, trying ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error(err);
    }
  });
  server.on("listening", () => {
    console.log(`MyControlPanel running at http://127.0.0.1:${port}/login`);
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
      const url = req.url || "";
      if (!url.startsWith("/ws/terminal")) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const shell = pty.spawn("/bin/bash", [], {
          name: "xterm-256color", cols: 80, rows: 24, cwd: "/home/srv/cp", env: process.env,
        });
        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === "input") shell.write(msg.data);
            else if (msg.type === "resize") shell.resize(msg.cols, msg.rows);
          } catch (e) { }
        });
        shell.onData((data) => { try { ws.send(data); } catch (e) { } });
        ws.on("close", () => shell.kill());
        shell.on("exit", () => { try { ws.close(); } catch (e) { } });
      });
    });
  });
}

startServer(PORT);
