const fs = require("fs");
const os = require("os");
const path = require("path");

module.exports = class TempUtil {
  static get DEFAULT_TEMP_DIR() {
    return path.join(__dirname, "../../..", "_out");
  }
  static get OS_TEMP_DIR() {
    return os.tmpdir();
  }

  // Accepts (testDir, filename) or just (filename) for backwards compat
  constructor(testDirOrFilename, filename) {
    const fname = filename ?? testDirOrFilename;
    this.fileName = `${path.parse(path.basename(fname)).name.replace(".", "-")}-`;
    this.tempFolders = new Set();
  }

  async mkTempFolder(tempDir = TempUtil.DEFAULT_TEMP_DIR) {
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }
    const tempFolder = await fs.promises.mkdtemp(path.join(tempDir, this.fileName));
    this.tempFolders.add(tempFolder);
    return tempFolder;
  }

  cleanUp() {
    for (let tempFolder of this.tempFolders) {
      fs.rmSync(tempFolder, { force: true, recursive: true });
    }
    this.tempFolders.clear();
  }

  async mkTempProject(src, tempDir) {
    const tmp = await this.mkTempFolder(tempDir);
    const dest = path.join(tmp, path.basename(src));
    await fs.promises.cp(src, dest, { recursive: true });
    return await fs.promises.realpath(dest);
  }
};
