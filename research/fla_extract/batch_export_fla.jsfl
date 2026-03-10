/**
 * Batch Export FLA → PNG Layers + Metadata
 * =========================================
 * JSFL Script for Adobe Animate
 *
 * Chạy:  Commands → Run Command → chọn file này
 *
 * Chức năng:
 *   1. Chọn thư mục chứa .fla files (hoặc file đang mở)
 *   2. Tự động TÁCH các top-level group trong 1 layer → thành nhiều layer riêng
 *   3. Export mỗi layer thành PNG transparent riêng
 *   4. Ghi _metadata.json + _flatten.png (preview)
 *
 * Dùng kết hợp với: tools/fla_to_stage.py để import vào workflow
 */

(function() {
    "use strict";

    // ══════════════════════════════════════
    //  CONFIGURATION
    // ══════════════════════════════════════
    var CANVAS_W = 1920;
    var CANVAS_H = 1080;

    // ══════════════════════════════════════
    //  MAIN
    // ══════════════════════════════════════

    var mode = prompt(
        "FLA → Stage Export\n\n" +
        "1 = Export file FLA đang mở\n" +
        "2 = Batch export cả thư mục\n\n" +
        "Nhập số (1 hoặc 2):",
        "1"
    );
    if (!mode) return;

    if (mode === "1") {
        _exportCurrentFile();
    } else if (mode === "2") {
        _batchExport();
    }


    // ══════════════════════════════════════
    //  EXPORT CURRENT FILE
    // ══════════════════════════════════════

    function _exportCurrentFile() {
        var doc = fl.getDocumentDOM();
        if (!doc) {
            alert("Chưa mở file FLA nào!");
            return;
        }

        var docPath = doc.pathURI || doc.path;
        if (!docPath) {
            alert("Hãy lưu file trước!");
            return;
        }

        var lastSlash = docPath.lastIndexOf("/");
        var docDir = docPath.substring(0, lastSlash + 1);
        var docName = docPath.substring(lastSlash + 1).replace(".fla", "").replace(".FLA", "");

        var outputDir = docDir + "stage_export/" + _sanitize(docName) + "/";
        if (!FLfile.exists(outputDir)) {
            FLfile.createFolder(outputDir);
        }

        var result = _exportOneFLA(doc, outputDir, docName);

        if (result) {
            alert(
                "✅ Export hoàn tất!\n\n" +
                "Layers: " + result.layerCount + "\n" +
                "Output: " + FLfile.uriToPlatformPath(outputDir) + "\n\n" +
                "Chạy fla_to_stage.py để import vào workflow."
            );
        }
    }


    // ══════════════════════════════════════
    //  BATCH EXPORT
    // ══════════════════════════════════════

    function _batchExport() {
        var inputURI = fl.browseForFolderURL("Chọn thư mục chứa file .fla");
        if (!inputURI) return;

        var outputURI = inputURI + "/stage_export/";
        if (!FLfile.exists(outputURI)) {
            FLfile.createFolder(outputURI);
        }

        var allFiles = FLfile.listFolder(inputURI, "files");
        var flaFiles = [];
        for (var i = 0; i < allFiles.length; i++) {
            var lower = allFiles[i].toLowerCase();
            if (lower.indexOf(".fla") === lower.length - 4) {
                flaFiles.push(allFiles[i]);
            }
        }

        if (flaFiles.length === 0) {
            alert("Không tìm thấy file .fla nào!");
            return;
        }

        var maxStr = prompt(
            "Tìm thấy " + flaFiles.length + " file .fla.\n" +
            "Nhập số file tối đa (Enter = tất cả):",
            String(flaFiles.length)
        );
        if (!maxStr) return;
        var maxFiles = parseInt(maxStr, 10) || flaFiles.length;
        if (maxFiles > flaFiles.length) maxFiles = flaFiles.length;

        fl.trace("═══ Batch Export: " + maxFiles + " files ═══");

        var ok = 0, fail = 0, errors = [];

        for (var fi = 0; fi < maxFiles; fi++) {
            var flaName = flaFiles[fi];
            fl.trace("[" + (fi + 1) + "/" + maxFiles + "] " + flaName);

            try {
                fl.openDocument(inputURI + "/" + flaName);
                var doc = fl.getDocumentDOM();
                if (!doc) throw "Cannot open";

                var safeName = flaName.replace(".fla", "").replace(".FLA", "");
                var fileOut = outputURI + _sanitize(safeName) + "/";
                if (!FLfile.exists(fileOut)) FLfile.createFolder(fileOut);

                _exportOneFLA(doc, fileOut, safeName);
                ok++;
            } catch (e) {
                fail++;
                errors.push(flaName + ": " + String(e));
                fl.trace("  ❌ " + String(e));
            }

            _closeAllDocuments();
        }

        fl.trace("═══ DONE: " + ok + " ok, " + fail + " errors ═══");
        alert(
            "✅ Batch Export Hoàn Tất!\n\n" +
            "Thành công: " + ok + "/" + maxFiles + "\n" +
            "Lỗi: " + fail + "\n\n" +
            "Output: " + FLfile.uriToPlatformPath(outputURI)
        );
    }


    // ══════════════════════════════════════
    //  CORE: EXPORT ONE FLA
    // ══════════════════════════════════════

    function _exportOneFLA(doc, outputURI, docName) {
        var timeline = doc.getTimeline();
        var docWidth = doc.width || CANVAS_W;
        var docHeight = doc.height || CANVAS_H;

        fl.trace("  Canvas: " + docWidth + "x" + docHeight);

        // ── Step 1: Save original state ──
        var origLayers = timeline.layers;
        var origVisibility = [];
        for (var ov = 0; ov < origLayers.length; ov++) {
            origVisibility.push(origLayers[ov].visible);
        }

        // ── Step 2: Export flatten first (toàn bộ scene nguyên bản) ──
        for (var fv = 0; fv < origLayers.length; fv++) {
            origLayers[fv].visible = true;
        }
        doc.exportPNG(outputURI + "_flatten.png", true, true);
        fl.trace("  → _flatten.png");

        // ── Step 3: Auto-split groups into layers ──
        // Thu thập tất cả top-level elements từ tất cả layers
        var elementsInfo = _collectTopLevelElements(timeline);
        fl.trace("  Top-level elements: " + elementsInfo.length);

        // Nếu chỉ có 1 element hoặc ít, export theo layer gốc
        if (elementsInfo.length <= 1) {
            return _exportByOriginalLayers(doc, timeline, outputURI, docName,
                                           docWidth, docHeight, origVisibility);
        }

        // ── Step 4: Tách từng element ra layer riêng ──
        // Duplicate document để không ảnh hưởng file gốc
        // Sử dụng phương pháp: ẩn tất cả → chọn + copy 1 element → paste vào layer mới

        var layerMeta = [];

        // Approach: Với mỗi element, chọn nó, ẩn phần còn lại, export
        // Vì các element nằm trong 1 layer, ta dùng selection-based export

        var sourceLayer = timeline.layers[_findMainLayerIndex(timeline)];
        var sourceLayerIdx = _findMainLayerIndex(timeline);

        // Go to frame 0
        timeline.currentFrame = 0;

        // Lấy tất cả elements trên stage
        doc.selectAll();
        var allElems = doc.selection ? doc.selection.slice() : [];
        doc.selectNone();

        fl.trace("  Selection-based elements: " + allElems.length);

        if (allElems.length <= 1) {
            // Fallback: export toàn bộ như 1 layer
            return _exportByOriginalLayers(doc, timeline, outputURI, docName,
                                           docWidth, docHeight, origVisibility);
        }

        // Export từng element riêng
        for (var ei = 0; ei < allElems.length; ei++) {
            var elem = allElems[ei];

            // Bỏ chọn tất cả
            doc.selectNone();

            // Ẩn tất cả layers
            for (var h = 0; h < timeline.layers.length; h++) {
                timeline.layers[h].visible = false;
            }

            // Hiện lại source layer
            sourceLayer.visible = true;

            // Chọn chỉ element này
            doc.selectNone();
            doc.selection = [elem];

            // Lấy thông tin vị trí
            var el = elem;
            var left = el.left || 0;
            var top = el.top || 0;
            var width = el.width || docWidth;
            var height = el.height || docHeight;
            var elemType = el.elementType || "shape";
            var elemName = el.name || "";

            // Tạo tên layer
            var layerLabel = elemName || ("element_" + (ei + 1));
            var fileName = String(ei) + "_" + _sanitize(layerLabel) + ".png";

            // ── CÁCH EXPORT TỪNG ELEMENT ──
            // Phương pháp: tạo layer mới, cut+paste element vào, export, rồi undo
            
            // Cut element
            doc.clipCut();
            
            // Tạo layer mới
            timeline.addNewLayer(layerLabel, "normal", false);
            var newLayerIdx = timeline.currentLayer;
            
            // Ẩn tất cả, chỉ hiện layer mới
            for (var nl = 0; nl < timeline.layers.length; nl++) {
                timeline.layers[nl].visible = (nl === newLayerIdx);
            }
            
            // Paste
            doc.clipPaste(true); // paste in place
            
            // Export PNG
            doc.exportPNG(outputURI + fileName, true, true);
            fl.trace("  → " + layerLabel + " → " + fileName);

            // Undo: xóa layer mới, paste lại element vào layer gốc
            // Xóa layer mới
            timeline.deleteLayer(newLayerIdx);
            
            // Select source layer
            timeline.currentLayer = sourceLayerIdx;
            
            // Paste lại element về vị trí gốc
            doc.clipPaste(true);
            doc.selectNone();

            // Layer metadata
            layerMeta.push({
                index: ei,
                name: layerLabel,
                fileName: fileName,
                type: _classifyByPosition(top, height, docHeight),
                posX: Math.round(left + width / 2),
                posY: Math.round(top + height / 2),
                width: Math.round(width),
                height: Math.round(height),
                visible: true
            });
        }

        // ── Khôi phục visibility ──
        for (var rv = 0; rv < timeline.layers.length && rv < origVisibility.length; rv++) {
            timeline.layers[rv].visible = origVisibility[rv];
        }

        // ── Ghi metadata ──
        var metadata = {
            sourceFLA: docName + ".fla",
            canvasWidth: docWidth,
            canvasHeight: docHeight,
            frameRate: doc.frameRate || 25,
            layers: layerMeta,
            flattenImage: "_flatten.png",
            exportMode: "auto-split",
            exportedAt: new Date().toISOString()
        };

        FLfile.write(outputURI + "_metadata.json", JSON.stringify(metadata, null, 2));
        fl.trace("  → _metadata.json (" + layerMeta.length + " layers)");

        return { layerCount: layerMeta.length };
    }


    // ══════════════════════════════════════
    //  FALLBACK: EXPORT BY ORIGINAL LAYERS
    // ══════════════════════════════════════

    function _exportByOriginalLayers(doc, timeline, outputURI, docName,
                                      docWidth, docHeight, origVisibility) {
        var layers = timeline.layers;
        var layerMeta = [];

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.layerType === "folder") continue;

            // Ẩn tất cả
            for (var h = 0; h < layers.length; h++) {
                layers[h].visible = false;
            }
            layer.visible = true;

            var layerName = layer.name || ("layer_" + i);
            var fileName = String(i) + "_" + _sanitize(layerName) + ".png";

            doc.exportPNG(outputURI + fileName, true, true);
            fl.trace("  → " + layerName + " → " + fileName);

            layerMeta.push({
                index: i,
                name: layerName,
                fileName: fileName,
                type: _classifyLayerType(layerName, i, layers.length),
                visible: true
            });
        }

        // Khôi phục
        for (var rv = 0; rv < layers.length; rv++) {
            layers[rv].visible = origVisibility[rv];
        }

        var metadata = {
            sourceFLA: docName + ".fla",
            canvasWidth: docWidth,
            canvasHeight: docHeight,
            frameRate: doc.frameRate || 25,
            layers: layerMeta,
            flattenImage: "_flatten.png",
            exportMode: "by-layer",
            exportedAt: new Date().toISOString()
        };

        FLfile.write(outputURI + "_metadata.json", JSON.stringify(metadata, null, 2));
        fl.trace("  → _metadata.json (" + layerMeta.length + " layers)");

        return { layerCount: layerMeta.length };
    }


    // ══════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════

    /** Thu thập thông tin top-level elements từ tất cả layers */
    function _collectTopLevelElements(timeline) {
        var results = [];
        var layers = timeline.layers;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.layerType === "folder") continue;
            var frames = layer.frames;
            if (frames.length > 0) {
                var frame = frames[0]; // First keyframe
                if (frame.elements) {
                    for (var e = 0; e < frame.elements.length; e++) {
                        results.push({
                            layerIndex: i,
                            elementIndex: e,
                            element: frame.elements[e]
                        });
                    }
                }
            }
        }
        return results;
    }

    /** Tìm index của layer chính (không phải folder) */
    function _findMainLayerIndex(timeline) {
        for (var i = 0; i < timeline.layers.length; i++) {
            if (timeline.layers[i].layerType !== "folder") return i;
        }
        return 0;
    }

    /** Phân loại type dựa trên vị trí Y trên canvas */
    function _classifyByPosition(top, height, canvasHeight) {
        var center = top + height / 2;
        // Nếu chiếm gần toàn bộ chiều cao → background
        if (height > canvasHeight * 0.7) return "background";
        // Nếu ở nửa trên → foreground
        if (center < canvasHeight * 0.3) return "foreground";
        return "prop";
    }

    /** Phân loại layer type từ tên */
    function _classifyLayerType(name, index, total) {
        var n = name.toLowerCase();
        if (n.indexOf("bg") >= 0 || n.indexOf("background") >= 0 ||
            n.indexOf("背景") >= 0) return "background";
        if (n.indexOf("fg") >= 0 || n.indexOf("foreground") >= 0 ||
            n.indexOf("前景") >= 0) return "foreground";
        if (index === total - 1) return "background";
        if (index === 0 && total > 1) return "foreground";
        return "prop";
    }

    function _sanitize(str) {
        return str.replace(/[\/\\:*?"<>|]/g, "_").replace(/\s+/g, "_");
    }

    function _closeAllDocuments() {
        while (fl.documents.length > 0) {
            fl.documents[0].close(false);
        }
    }

})();
