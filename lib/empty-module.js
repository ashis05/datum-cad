// Empty stub used to satisfy Turbopack's static resolution of Node built-ins
// (fs, path) referenced inside dead, browser-unreachable code paths of
// replicad / replicad-opencascadejs. These branches never execute in the
// browser; the kernel loads the .wasm from /public via locateFile instead.
module.exports = {};
