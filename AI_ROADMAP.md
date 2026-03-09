# 🎬 AI Agent System — Roadmap

## ✅ Completed

### Phase 1: Core Pipeline
- [x] Director Agent — prompt → ScenePlan JSON
- [x] Builder Agent — ScenePlan → workflow nodes + edges
- [x] Reviewer Agent — text-based scene review + corrections
- [x] Orchestrator — Director → Builder → Reviewer loop
- [x] Frontend AIGeneratePanel — prompt input, logs, Apply to Workflow

### Phase 2: Model & Key Management
- [x] Dynamic model discovery (`/api/ai/models`)
- [x] Multi-key pool with rotation on rate limit
- [x] Frontend model status check (green/yellow/red)
- [x] Switch API key from UI

### Phase 3: AI Frame Selection
- [x] Director sees character layer groups (poses, faces, accessories)
- [x] AI chooses specific assets per frame matching scene mood
- [x] Multi-frame Scene Beats (Opening → Action → Reaction → Resolution)
- [x] Builder resolves asset names → hashes (exact → partial → fallback)
- [x] Frame durations must sum to total_duration

### Phase 4: Reviewer & Preview
- [x] Reviewer evaluates frame selections (pose, expression, timing)
- [x] `_build_node_id_reference` shows full frame data to Reviewer
- [x] Frontend Frame Preview panel before Apply
- [x] Exit Preview button in playback controls
- [x] Empty Gemini response handling (auto-retry 3x)

---

## 🔧 Next Up

### Phase 5: Builder Frame Corrections
- [ ] Builder can apply Reviewer's frame corrections (change pose/face per frame)
- [ ] Handle `sequence[N].layers.GROUP = "new_asset"` correction format
- [ ] Handle `sequence[N].duration = new_value` correction format
- [ ] Validate corrections reference valid node IDs and fields

### Phase 6: Frontend Frame Editing
- [ ] Click frame in preview → open layer picker
- [ ] Show character's available assets per group → click to swap
- [ ] Re-render preview after frame change
- [ ] Drag to adjust frame duration
- [ ] Add/remove frames from timeline

### Phase 7: Rate Limit Resilience
- [ ] Save pipeline progress after each agent step
- [ ] Resume from last successful step on retry
- [ ] Show "API limit reached" toast with key switch option
- [ ] Exponential backoff with user-visible countdown

### Phase 8: Polish & Optimization
- [ ] Optimize Check Models (use models.list instead of generate_content test)
- [ ] Director auto-set total_duration based on prompt complexity
- [ ] Cache model list results (refresh button to update)
- [ ] Loading indicator per agent step (Director thinking... Builder building...)

---

## 🚀 Future Ideas
- [ ] Vision AI review with actual canvas screenshot
- [ ] Multi-scene storyboard (Director plans multiple scenes)
- [ ] Voice/dialogue integration with audio nodes
- [ ] Scene template library (preset scene types)
- [ ] Export scene plan as shareable JSON
