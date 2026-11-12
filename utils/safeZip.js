"use strict";

const { inflateRawSync } = require("node:zlib");

const EOCD = 0x06054b50;
const CENTRAL_FILE = 0x02014b50;
const LOCAL_FILE = 0x04034b50;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 128;

class ZipSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipSafetyError";
  }
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new ZipSafetyError("The ZIP archive has no valid end record.");
}

function safeName(name) {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return name.split("/").every((part) => part !== ".." && part !== ".");
}

function readZipEntries(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new ZipSafetyError("The ZIP archive exceeds the 25 MB import limit.");
  if (buffer.length < 22) throw new ZipSafetyError("The ZIP archive is too small to be valid.");

  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (diskNumber || centralDisk || diskEntries !== entryCount) throw new ZipSafetyError("Multi-disk ZIP archives are not supported.");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new ZipSafetyError("ZIP64 archives are not supported by this importer.");
  if (entryCount > MAX_ENTRIES) throw new ZipSafetyError(`The ZIP archive exceeds the ${MAX_ENTRIES}-file limit.`);
  if (centralOffset + centralSize > eocdOffset) throw new ZipSafetyError("The ZIP central directory is outside the archive bounds.");

  const entries = [];
  const seen = new Set();
  let cursor = centralOffset;
  let totalSize = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralOffset + centralSize || buffer.readUInt32LE(cursor) !== CENTRAL_FILE) {
      throw new ZipSafetyError("The ZIP central directory is malformed.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > centralOffset + centralSize) throw new ZipSafetyError("A ZIP entry header is incomplete.");

    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = nameBytes.toString(flags & 0x0800 ? "utf8" : "latin1");
    if (!safeName(name)) throw new ZipSafetyError("The ZIP archive contains an unsafe entry path.");
    if (seen.has(name)) throw new ZipSafetyError(`The ZIP archive contains a duplicate entry: ${name}`);
    seen.add(name);

    if (flags & 0x0001) throw new ZipSafetyError(`Encrypted ZIP entries are not supported: ${name}`);
    if (method !== 0 && method !== 8) throw new ZipSafetyError(`Unsupported ZIP compression method for ${name}.`);
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new ZipSafetyError(`The ZIP entry exceeds the 8 MB limit: ${name}`);
    totalSize += uncompressedSize;
    if (totalSize > MAX_TOTAL_BYTES) throw new ZipSafetyError("The ZIP archive expands beyond the 32 MB import limit.");
    if (compressedSize > buffer.length || localOffset + 30 > centralOffset) throw new ZipSafetyError(`The ZIP entry is outside archive bounds: ${name}`);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE) throw new ZipSafetyError(`The ZIP local header is invalid: ${name}`);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataEnd > centralOffset) throw new ZipSafetyError(`The ZIP entry data is outside archive bounds: ${name}`);

    const compressed = buffer.subarray(dataOffset, dataEnd);
    let contents;
    try {
      contents = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES + 1 });
    } catch {
      throw new ZipSafetyError(`The ZIP entry could not be safely decompressed: ${name}`);
    }
    if (contents.length !== uncompressedSize || crc32(contents) !== checksum) {
      throw new ZipSafetyError(`The ZIP entry failed its size or checksum validation: ${name}`);
    }
    entries.push({ name, contents });
    cursor = end;
  }

  if (cursor !== centralOffset + centralSize) throw new ZipSafetyError("The ZIP central directory length is inconsistent.");
  return entries;
}

module.exports = { readZipEntries, ZipSafetyError };
