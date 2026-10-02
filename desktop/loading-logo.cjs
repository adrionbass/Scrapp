const fs = require("node:fs/promises");
const path = require("node:path");
const TurboWarp = require("@turbowarp/packager");

async function createWhiteLoadingLogo() {
  const source = await fs.readFile(path.join(__dirname, "assets", "scrapp-logo.svg"), "utf8");
  const whiteLogo = source.replace(/fill="#[0-9a-f]{6}"/gi, 'fill="#ffffff"');
  return new TurboWarp.Image("image/svg+xml", Buffer.from(whiteLogo));
}

module.exports = { createWhiteLoadingLogo };
