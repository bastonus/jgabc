#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Helper ultra-rapide pour empaqueter des listes de fichiers en archive zip/pack.
"""
import sys
import os
import zipfile

def pack(list_file, output_pack, root_dir):
    if not os.path.exists(list_file):
        print(f"[ERR] File list not found: {list_file}", file=sys.stderr)
        sys.exit(1)

    with open(list_file, 'r', encoding='utf-8') as f:
        files = [line.strip() for line in f if line.strip()]

    temp_pack = output_pack + '.tmp'
    if os.path.exists(temp_pack):
        os.remove(temp_pack)

    with zipfile.ZipFile(temp_pack, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for f in files:
            if os.path.exists(f):
                arcname = os.path.relpath(f, root_dir).replace('\\', '/')
                z.write(f, arcname)

    if os.path.exists(output_pack):
        os.remove(output_pack)
    os.rename(temp_pack, output_pack)

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: python pack_zip.py <list_file> <output_pack> <root_dir>", file=sys.stderr)
        sys.exit(1)
    pack(sys.argv[1], sys.argv[2], sys.argv[3])
