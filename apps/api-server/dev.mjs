process.env.NODE_ENV = "development";

const { buildAll } = await import("./build.mjs");

await buildAll();
await import("./dist/index.mjs");
