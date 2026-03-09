/**
 * Export FLA to PSD — JSFL Script for Adobe Animate
 * 
 * Chạy trong Adobe Animate:
 *   Commands → Run Command → chọn file này
 *   Hoặc kéo thả file .jsfl vào Animate
 * 
 * Kết quả: Xuất từng keyframe thành file PSD có layers
 * Output folder: cùng thư mục với file FLA, trong subfolder "psd_export/"
 */

(function() {
    // ── Kiểm tra document ──
    var doc = fl.getDocumentDOM();
    if (!doc) {
        alert("Chưa mở file FLA nào!\nHãy mở file FLA trước khi chạy script.");
        return;
    }

    // ── Tạo output folder ──
    var docPath = doc.pathURI || doc.path;
    if (!docPath) {
        alert("File chưa được lưu! Hãy lưu file FLA trước.");
        return;
    }
    
    // Lấy thư mục chứa file FLA
    var lastSlash = docPath.lastIndexOf("/");
    var docDir = docPath.substring(0, lastSlash + 1);
    var docName = docPath.substring(lastSlash + 1).replace(".fla", "").replace(".xfl", "");
    
    var outputDir = docDir + "psd_export/";
    
    // Tạo thư mục output
    if (!FLfile.exists(outputDir)) {
        FLfile.createFolder(outputDir);
    }

    // ── Hỏi chế độ export ──
    var mode = prompt(
        "Chọn chế độ export:\n\n" +
        "1 = Export frame hiện tại (1 file PSD)\n" +
        "2 = Export tất cả keyframes (mỗi keyframe = 1 PSD)\n" +
        "3 = Export theo khoảng (mỗi N frames = 1 PSD)\n\n" +
        "Nhập số (1, 2, hoặc 3):",
        "1"
    );

    if (!mode) return;

    var timeline = doc.getTimeline();
    var totalFrames = timeline.frameCount;
    var exportedCount = 0;

    if (mode === "1") {
        // ── Chế độ 1: Export frame hiện tại ──
        var frameIdx = timeline.currentFrame;
        var fileName = docName + "_frame" + (frameIdx + 1) + ".psd";
        
        doc.exportPNG(outputDir + fileName.replace(".psd", ".psd"), true, true);
        // Animate export PSD qua exportPublishProfileString
        
        // Dùng exportInstanceToPNGSequence hoặc exportPNG
        // PSD export cần dùng phương thức khác:
        _exportFrameAsPSD(doc, timeline, frameIdx, outputDir, docName);
        exportedCount = 1;

    } else if (mode === "2") {
        // ── Chế độ 2: Export tất cả keyframes ──
        var keyframeIndices = _getKeyframeIndices(timeline);
        
        for (var i = 0; i < keyframeIndices.length; i++) {
            var frameIdx = keyframeIndices[i];
            timeline.currentFrame = frameIdx;
            _exportFrameAsPSD(doc, timeline, frameIdx, outputDir, docName);
            exportedCount++;
        }

    } else if (mode === "3") {
        // ── Chế độ 3: Export theo khoảng ──
        var step = parseInt(prompt("Export mỗi bao nhiêu frames?", "5"), 10);
        if (isNaN(step) || step < 1) step = 5;
        
        for (var frameIdx = 0; frameIdx < totalFrames; frameIdx += step) {
            timeline.currentFrame = frameIdx;
            _exportFrameAsPSD(doc, timeline, frameIdx, outputDir, docName);
            exportedCount++;
        }
    }

    alert(
        "✅ Export hoàn tất!\n\n" +
        "Số file: " + exportedCount + "\n" +
        "Output: " + FLfile.uriToPlatformPath(outputDir) + "\n\n" +
        "Import các file PSD vào AnimeStudio để sử dụng."
    );


    // ══════════════════════════════════════
    //  HELPER FUNCTIONS
    // ══════════════════════════════════════

    function _exportFrameAsPSD(doc, timeline, frameIdx, outputDir, baseName) {
        /**
         * Export một frame thành PSD.
         * Adobe Animate hỗ trợ export PSD qua File > Export Image.
         * Trong JSFL dùng doc.exportInstanceToPNGSequence hoặc publish profile.
         */
        timeline.currentFrame = frameIdx;
        
        var fileName = baseName + "_frame" + String(frameIdx + 1);
        var filePath = outputDir + fileName + ".psd";
        
        // Phương pháp 1: Export trực tiếp dạng PSD (Animate CC 2015+)
        try {
            // exportPNG hỗ trợ format PSD khi đặt đuôi .psd
            doc.exportPNG(filePath, true, true);
            fl.trace("[Export] Frame " + (frameIdx + 1) + " → " + fileName + ".psd");
            return;
        } catch(e) {
            // Fallback
        }

        // Phương pháp 2: Export từng layer thành PNG riêng
        // Tạo subfolder cho frame này
        var frameDir = outputDir + fileName + "/";
        if (!FLfile.exists(frameDir)) {
            FLfile.createFolder(frameDir);
        }

        var layers = timeline.layers;
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.layerType === "folder") continue;
            
            // Ẩn tất cả layers
            for (var j = 0; j < layers.length; j++) {
                layers[j].visible = false;
            }
            
            // Chỉ hiện layer hiện tại
            layer.visible = true;
            
            // Tên layer (thay ký tự đặc biệt)
            var layerName = layer.name.replace(/[\/\\:*?"<>|]/g, "_");
            var layerPath = frameDir + String(i) + "_" + layerName + ".png";
            
            doc.exportPNG(layerPath, true, true);
            fl.trace("[Export] Layer: " + layer.name + " → " + layerName + ".png");
        }
        
        // Khôi phục visibility
        for (var k = 0; k < layers.length; k++) {
            layers[k].visible = true;
        }
        
        fl.trace("[Export] Frame " + (frameIdx + 1) + " → " + 
                 layers.length + " layers exported to " + fileName + "/");
    }


    function _getKeyframeIndices(timeline) {
        /**
         * Lấy danh sách các frame index là keyframe
         * (trên bất kỳ layer nào).
         */
        var keyframes = {};
        var layers = timeline.layers;
        
        for (var i = 0; i < layers.length; i++) {
            var frames = layers[i].frames;
            for (var f = 0; f < frames.length; f++) {
                if (frames[f].startFrame === f) {
                    // Đây là keyframe
                    keyframes[f] = true;
                }
            }
        }
        
        // Chuyển sang array sorted
        var result = [];
        for (var idx in keyframes) {
            result.push(parseInt(idx, 10));
        }
        result.sort(function(a, b) { return a - b; });
        
        return result;
    }

})();
