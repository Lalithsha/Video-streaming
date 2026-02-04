import mediasoup from "mediasoup";

async function start() {
  const worker = await mediasoup.createWorker();
  worker.on("died", () => {
    console.error("MediaSoup worker died, exiting.");
    process.exit(1);
  });
  console.log("MediaSoup worker started", worker.pid);
}

start().catch((error) => {
  console.error("Failed to start MediaSoup worker", error);
  process.exit(1);
});
