# Aegis Critic Coordinate Hallucination Bug

## 1. Overview
The Aegis Review system (`SwarmCriticAgent`) is erroneously rejecting perfectly valid spatial coordinates produced by the `SwarmNegotiatorAgent`. 

Despite the Negotiator predicting valid WebM Scene canvas positions (e.g., `target_x=7.0` and `target_x=14.2` which fall correctly within `[0.0, 19.2]`), the Critic Agent hallucinates an "Out of Bounds" or "Coordinate Mismatch" error (FAIL - Score 2).

## 2. Architecture & Data Flow
The positional staging architecture relies on the following data flow:
1. **Vision AI / Stage Analysis**: Analyzes the layers of the background and outputs bounding boxes in **Percentages `[0 - 100]`** (`bbox_x`, `bbox_y`, `bbox_w`, `bbox_h`).
2. **Swarm Negotiator**: Receives the `[0 - 100]` stage analysis and outputs character locations in **Canvas Units `[0.0 - 19.2]`** (for `target_x`) and `[0.0 - 10.8]` (for `y`). 
3. **Swarm Critic (Aegis)**: Receives the same `[0 - 100]` stage analysis AND the Negotiator's `[0.0 - 19.2]` proposal to verify correctness.

## 3. The Root Cause of the Bug
The Prompt for `SwarmCriticAgent` lists the bounding box rule:
> `Out of Bounds (Lố Khung Hình): target_x bé hơn 0 hoặc lớn hơn 19.2.`

However, when the Critic AI sees `target_x = 7.0`, it looks at the reference `stage_analysis` which contains raw elements like `"bbox_x": 45`. The LLM's spatial reasoning becomes mathematically confused between the two scales:
- It hallucinates that `7.0` was calculated by the Negotiator using the `[0 - 100]` percent scale (which would mean 7% instead of 7 units of canvas).
- It outputs the false feedback: *"Các giá trị target_x (6.0 và 9.0) nằm ngoài phạm vi cho phép... đang bị nhầm lẫn với tọa độ 0-100 của bbox"*.
- It ironically accuses the Negotiator of mixing up the scales, even though the Negotiator was entirely correct.

This causes the Aegis system to enter a cycle of rejecting perfectly valid coordinates, forcing the pipeline to drop the Aegis protection entirely (fallback bypass) when the maximum retry count is reached.

## 4. Proposed Fixes
To resolve this LLM arithmetic hallucination, the maintainer should implement one (or both) of the following solutions:

### Solution A: Pre-Normalize Stage Analysis (Recommended)
Before passing `stage_analysis` to the Swarm Agents in `backend/routers/automation.py`, parse and transform the `bbox` percentages directly into `[0 - 19.2]` and `[0 - 10.8]` canvas units inside standard Python. 
By sending uniform coordinates to both Agents (e.g. `{"canvas_center_x": 9.6, "canvas_width": 4.0}`), the AI no longer has to perform zero-shot mathematical conversions across two different coordinate dimensions in its head.

### Solution B: Prompt Injection Correction
Update `SWARM_CRITIC_PROMPT` in `backend/core/agents/swarm_critic_agent.py` to explicitly clarify the dual-coordinate system:
> "LƯU Ý QUAN TRỌNG VỀ TỌA ĐỘ: Dữ liệu `stage_analysis` sử dụng hệ % (0-100). Dữ liệu `proposed_positions` sử dụng hệ Canvas (X: 0-19.2, Y: 0-10.8). Bạn phải tự quy đổi `X_canvas = (bbox_x / 100) * 19.2`. Các tọa độ như 6.0 hay 14.2 của target_x HOÀN TOÀN HỢP LỆ vì nó nằm trong [0, 19.2]. TUYỆT ĐỐI không được đánh lỗi Out of Bounds nếu X nằm trong [0, 19.2]."
