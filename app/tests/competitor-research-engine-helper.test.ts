import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const helper = resolve(appRoot, "bin/competitor-research-engine.py");

test("the fixture media writer is bounded, atomic, private, and collision safe", () => {
  const result = spawnSync("python3", ["-c", String.raw`
import importlib.util
import os
import pathlib
import stat
import tempfile

spec = importlib.util.spec_from_file_location("competitor_research_engine", ${JSON.stringify(helper)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix="negroni-media-helper-") as temporary:
    stem = pathlib.Path(temporary) / "media" / "fixture"
    content = b"synthetic-media"
    path, digest, byte_size = module.write_fixture_media(stem, content, "image", max_bytes=1024)
    assert path.read_bytes() == content
    assert byte_size == len(content)
    assert path.name == digest + ".png"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert list(path.parent.glob("*.tmp")) == []

    repeated = module.write_fixture_media(stem, content, "image", max_bytes=1024)
    assert repeated == (path, digest, byte_size)

    try:
        module.write_fixture_media(stem, b"too-large", "image", max_bytes=4)
    except ValueError as error:
        assert "size limit" in str(error)
    else:
        raise AssertionError("oversized fixture media was accepted")

    original_link = module.os.link
    module.os.link = lambda *_: (_ for _ in ()).throw(OSError("simulated atomic publish failure"))
    try:
        module.write_fixture_media(stem, b"replacement-failure", "image", max_bytes=1024)
    except OSError:
        pass
    else:
        raise AssertionError("simulated atomic publish failure was not raised")
    finally:
        module.os.link = original_link
    assert list(path.parent.glob("*.tmp")) == []
`], {
    cwd: resolve(appRoot, ".."),
    encoding: "utf8",
    timeout: 10_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
