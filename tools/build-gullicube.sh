#!/bin/sh
# Build a single-threaded gullicube for the browser.
# No pthreads and no SharedArrayBuffer. The thread and mutex headers in
# tools/nothread run each worker inline.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
src=${GULLICUBE_SRC:-/tmp/gullicube}
out=$root/public/gullicube
if [ ! -x "$src/gullicube" ] && [ ! -f "$src/src/full/gullicube.cpp" ]; then
  echo "gullicube sources not found at $src" >&2
  exit 1
fi
if ! command -v em++ >/dev/null 2>&1; then
  if [ -f /tmp/emsdk/emsdk_env.sh ]; then
    # shellcheck disable=SC1091
    (cd /tmp/emsdk && . ./emsdk_env.sh && env) > /tmp/emsdk-env.txt
    # shellcheck disable=SC1091
    set -a
    # The env dump is KEY=VALUE lines from a subshell that sourced emsdk.
    while IFS= read -r line; do
      case "$line" in
        PATH=*|EMSDK=*|EMSDK_NODE=*|EMSDK_PYTHON=*|SSL_CERT_FILE=*) export "$line" ;;
      esac
    done < /tmp/emsdk-env.txt
    set +a
  else
    echo "em++ is not on PATH" >&2
    exit 1
  fi
fi
mkdir -p "$out/data"
cp "$src/data/"*.cls "$out/data/"
em++ -O3 -std=c++20 \
  -I"$root/tools/nothread" \
  -I"$src/src/brob" \
  -I"$src/src/full" \
  "$src/src/full/"*.cpp "$src/src/brob/"*.cpp \
  -sALLOW_MEMORY_GROWTH=1 \
  -sMAXIMUM_MEMORY=2147483648 \
  -sINITIAL_MEMORY=134217728 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME=Gullicube \
  -sINVOKE_RUN=0 \
  -sEXIT_RUNTIME=1 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sENVIRONMENT=worker,node \
  -sSTACK_SIZE=8388608 \
  -sFILESYSTEM=1 \
  -o "$out/gullicube.js"
python3 - "$out" << 'PY'
import hashlib, json, os, sys
root = sys.argv[1]
skip = {"SHA256SUMS", "manifest.json", "NOTICE", "LICENSE-MPL-2.0"}
entries = []
digest = hashlib.sha256()
for dirpath, _, names in os.walk(root):
    for name in sorted(names):
        if name in skip:
            continue
        path = os.path.join(dirpath, name)
        data = open(path, "rb").read()
        file_hash = hashlib.sha256(data).hexdigest()
        digest.update(file_hash.encode())
        entries.append({"name": os.path.relpath(path, root).replace("\\", "/"), "bytes": len(data), "sha256": file_hash})
entries.sort(key=lambda item: item["name"])
manifest = {"cache": "rubic-gullicube-" + digest.hexdigest()[:12], "bytes": sum(item["bytes"] for item in entries), "files": entries}
open(os.path.join(root, "manifest.json"), "w").write(json.dumps(manifest, indent=2) + "\n")
open(os.path.join(root, "SHA256SUMS"), "w").write("".join(f"{item['sha256']}  ./{item['name']}\n" for item in entries))
PY
echo "built $out"
