import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveLogger } from "@package/logger-adapter";

const log = resolveLogger({ source: "@trebired/update" });
const root = path.resolve(import.meta.dirname, "..", "..");
const api = await import(path.join(root, "dist", "index.js"));
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
const privateKey = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const work = fs.mkdtempSync(path.join(os.tmpdir(), "trebired-update-verify-"));
const served = new Map();

function serve(name, bytes) {
  served.set(`https://downloads.test/${name}`, Buffer.from(bytes));
  return `https://downloads.test/${name}`;
}

async function fetchImpl(url) {
  const body = served.get(String(url));
  return body ? new Response(body) : new Response("missing", { status: 404 });
}

function signedManifest(entity, releaseVersion, artifacts) {
  const raw = { artifacts, entity, recordedAt: "2026-01-01T00:00:00.000Z", releaseVersion, version: 1 };
  const normalized = api.normalizeManifest({ ...raw, signature: { type: "ed25519", value: "AA==" } });
  delete normalized.signature;
  return { ...normalized, signature: api.createDetachedSignature(normalized, privateKey) };
}

function artifact(entity, fileName, bytes, extra) {
  return {
    arch: "x64",
    checksum: { type: "sha256", value: createHash("sha256").update(bytes).digest("hex") },
    entity,
    fileName,
    id: `${entity}-linux-x64`,
    os: "linux",
    size: bytes.length,
    url: serve(fileName, bytes),
    ...extra,
  };
}

function publish(entity, version, artifacts) {
  serve(`${entity}-${version}.json`, JSON.stringify(signedManifest(entity, version, artifacts)));
  return `https://downloads.test/${entity}-${version}.json`;
}

function backups(livePath) {
  const prefix = `.${path.basename(livePath)}.`;
  return fs.readdirSync(path.dirname(livePath)).filter((entry) => entry.startsWith(prefix) && entry.endsWith(".previous"));
}

function input(entity, version, manifestUrl, extra) {
  return {
    arch: "x64",
    currentVersion: version,
    entity,
    fetchImpl,
    manifestUrl,
    os: "linux",
    verificationKeys: [publicKey],
    workingDirectory: path.join(work, `${entity}-work`),
    ...extra,
  };
}

async function verifyFileUpdates() {
  const livePath = path.join(work, "opt", "agent", "agent-bin");
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  fs.writeFileSync(livePath, "agent 1.0.0");
  const second = Buffer.from("agent 1.1.0");
  const url = publish("agent", "1.1.0", [artifact("agent", "agent-1.1.0", second, { installStrategy: "raw" })]);
  const target = { activationTarget: { livePath }, installStrategy: "raw" };
  await api.applyUpdate(input("agent", "1.0.0", url, target));
  assert.equal(fs.readFileSync(livePath, "utf8"), "agent 1.1.0", "a raw artifact replaces the live file");
  assert.equal(backups(livePath).length, 1, "the previous file is kept beside the live one, on the same filesystem");
  const third = Buffer.from("agent 1.2.0");
  const nextUrl = publish("agent", "1.2.0", [artifact("agent", "agent-1.2.0", third, { installStrategy: "raw" })]);
  await assert.rejects(
    api.applyUpdate(input("agent", "1.1.0", nextUrl, { ...target, expectedVersion: "1.1.5" })),
    /Release 1\.1\.5 is not available; the manifest offers 1\.2\.0/u,
    "an update pinned to one version refuses any other release",
  );
  assert.equal(fs.readFileSync(livePath, "utf8"), "agent 1.1.0", "a refused update leaves the live file alone");
  await api.applyUpdate(input("agent", "1.1.0", nextUrl, { ...target, expectedVersion: "1.2.0" }));
  assert.equal(fs.readFileSync(livePath, "utf8"), "agent 1.2.0");
  assert.equal(backups(livePath).length, 1, "only the latest previous version is kept");
}

function archive(version) {
  const source = path.join(work, `src-${version}`);
  fs.mkdirSync(path.join(source, "app", "lib"), { recursive: true });
  fs.writeFileSync(path.join(source, "app", "package.json"), JSON.stringify({ version }));
  fs.writeFileSync(path.join(source, "app", "lib", "main.js"), `export default "${version}";\n`);
  fs.mkdirSync(path.join(source, "app", "bin"), { recursive: true });
  fs.symlinkSync("../lib/main.js", path.join(source, "app", "bin", "main"));
  const file = path.join(work, `app-${version}.tar.gz`);
  execFileSync("tar", ["-C", source, "-czf", file, "app"]);
  return fs.readFileSync(file);
}

async function verifyDirectoryUpdates() {
  const livePath = path.join(work, "opt", "app");
  fs.mkdirSync(livePath, { recursive: true });
  fs.writeFileSync(path.join(livePath, "package.json"), JSON.stringify({ version: "1.0.0" }));
  fs.writeFileSync(path.join(livePath, "stale.txt"), "only in 1.0.0");
  const bytes = archive("1.1.0");
  const fields = { archiveFormat: "tar.gz", installStrategy: "archive" };
  const url = publish("app", "1.1.0", [artifact("app", "app-1.1.0.tar.gz", bytes, fields)]);
  const readInstalledVersion = () => JSON.parse(fs.readFileSync(path.join(livePath, "package.json"), "utf8")).version;
  const target = { activationTarget: { archiveRoot: "app", kind: "directory", livePath, preserveOwner: true }, installStrategy: "archive" };
  const applied = await api.applyUpdate(input("app", "1.0.0", url, { ...target, readInstalledVersion }));
  assert.equal(readInstalledVersion(), "1.1.0", "an archive activates as a whole directory");
  assert.equal(fs.readFileSync(path.join(livePath, "lib", "main.js"), "utf8"), 'export default "1.1.0";\n');
  assert.equal(fs.existsSync(path.join(livePath, "stale.txt")), false, "files the new version dropped are gone");
  assert.equal(fs.readlinkSync(path.join(livePath, "bin", "main")), "../lib/main.js", "relative symlinks inside the archive are kept");
  assert.equal(backups(livePath).length, 1, "the previous directory is kept beside the live one");
  await api.rollbackActivatedArtifact({ rollback: applied.activation.rollback });
  assert.equal(readInstalledVersion(), "1.0.0", "a rollback puts the previous directory back");
  assert.equal(fs.existsSync(path.join(livePath, "stale.txt")), true);
  const wrongVersion = () => "9.9.9";
  await assert.rejects(api.applyUpdate(input("app", "1.0.0", url, { ...target, readInstalledVersion: wrongVersion })));
  assert.equal(readInstalledVersion(), "1.0.0", "a directory that does not report the release version is rolled back");
}

async function verifyEscapingLinksRefused() {
  const source = path.join(work, "src-evil");
  fs.mkdirSync(path.join(source, "app"), { recursive: true });
  fs.writeFileSync(path.join(source, "app", "package.json"), JSON.stringify({ version: "6.6.6" }));
  fs.symlinkSync("../../../../etc/passwd", path.join(source, "app", "passwd"));
  const file = path.join(work, "app-evil.tar.gz");
  execFileSync("tar", ["-C", source, "-czf", file, "app"]);
  const bytes = fs.readFileSync(file);
  const fields = { archiveFormat: "tar.gz", installStrategy: "archive" };
  const url = publish("app", "6.6.6", [artifact("app", "app-6.6.6.tar.gz", bytes, fields)]);
  const livePath = path.join(work, "opt", "app");
  const target = { activationTarget: { archiveRoot: "app", kind: "directory", livePath }, installStrategy: "archive" };
  await assert.rejects(
    api.applyUpdate(input("app", "1.0.0", url, target)),
    /escapes root/u,
    "an archive symlink that points outside the archive is refused",
  );
}

try {
  await verifyFileUpdates();
  await verifyDirectoryUpdates();
  await verifyEscapingLinksRefused();
  log.info("verify-update", "Update verification succeeded.");
} finally {
  fs.rmSync(work, { force: true, recursive: true });
}
