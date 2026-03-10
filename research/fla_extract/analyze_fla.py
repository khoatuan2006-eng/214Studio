#!/usr/bin/env python3
"""Check more .fla files: how many groups inside, do some have named groups?"""
import zipfile
import xml.etree.ElementTree as ET
import os

NS = '{http://ns.adobe.com/xfl/2008/}'
FLA_DIR = r"D:\tài nguyên\oss\20251021"

fla_files = sorted([f for f in os.listdir(FLA_DIR) if f.endswith('.fla')])

# Check 10 diverse samples
samples = fla_files[::len(fla_files)//10][:10]  # evenly spaced 10 samples
print(f"Checking {len(samples)} sample .fla files...\n")

for fname in samples:
    fpath = os.path.join(FLA_DIR, fname)
    try:
        with zipfile.ZipFile(fpath, 'r') as z:
            xml_data = z.read('DOMDocument.xml').decode('utf-8')
        root = ET.fromstring(xml_data)
        
        layers = root.findall(f'.//{NS}DOMLayer')
        
        # Count top-level elements in each layer
        all_top_elems = []
        for layer in layers:
            frames = layer.findall(f'.//{NS}DOMFrame')
            for frame in frames:
                elements = frame.find(f'{NS}elements')
                if elements is not None:
                    for child in elements:
                        tag = child.tag.replace(NS, '')
                        name = child.get('name', '')
                        # If DOMGroup, count members
                        members = child.find(f'{NS}members')
                        member_count = len(list(members)) if members is not None else 0
                        all_top_elems.append({'tag': tag, 'name': name, 'members': member_count})
        
        layer_names = [l.get('name') for l in layers]
        total_members = sum(e['members'] for e in all_top_elems)
        named = [e for e in all_top_elems if e['name']]
        
        print(f"[{fname[:40]}]")
        print(f"  Layers: {len(layers)} {layer_names}")
        print(f"  Top elements: {len(all_top_elems)}  Total sub-groups: {total_members}")
        if named:
            print(f"  Named elements: {[e['name'] for e in named]}")
        print()
    except Exception as e:
        print(f"[{fname[:40]}] ERROR: {e}\n")
