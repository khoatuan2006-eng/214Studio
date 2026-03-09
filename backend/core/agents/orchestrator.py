"""
Orchestrator — Điều phối pipeline AI Agent Team

Pipeline:
1. Director Agent → ScenePlan
2. Builder Agent → Workflow Nodes
3. Review Loop: Scene Analyzer + Vision AI → Corrections → Re-build
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from backend.core.ai_config import get_ai_config
from backend.core.agents import director_agent, builder_agent, reviewer_agent
from backend.core.agents.builder_agent import WorkflowResult
from backend.core.agents.reviewer_agent import ReviewResult
from backend.core.scene_analyzer import analyze_scene

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
#  PIPELINE RESULT
# ══════════════════════════════════════════════

@dataclass
class AgentLog:
    agent: str        # "director", "builder", "reviewer"
    status: str       # "running", "completed", "error"
    message: str = ""
    data: Any = None

    def to_dict(self) -> dict:
        return {
            "agent": self.agent,
            "status": self.status,
            "message": self.message,
        }


@dataclass
class PipelineResult:
    success: bool = False
    workflow: WorkflowResult | None = None
    review: ReviewResult | None = None
    plan_summary: str = ""
    logs: list[AgentLog] = field(default_factory=list)
    total_rounds: int = 0

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "workflow": self.workflow.to_dict() if self.workflow else None,
            "review": self.review.to_dict() if self.review else None,
            "plan_summary": self.plan_summary,
            "logs": [l.to_dict() for l in self.logs],
            "total_rounds": self.total_rounds,
        }


# ══════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════

async def run_pipeline(
    prompt: str,
    available_characters: list[dict] | None = None,
    available_backgrounds: list[dict] | None = None,
    screenshot_callback=None,
) -> PipelineResult:
    """
    Run the full AI Agent Team pipeline.

    Args:
        prompt: User's scene description
        available_characters: Characters from library
        available_backgrounds: Backgrounds from library
        screenshot_callback: async function(workflow) -> base64 screenshot (optional)

    Returns:
        PipelineResult with workflow, review, and logs
    """
    config = get_ai_config()
    result = PipelineResult()
    chars = available_characters or []
    bgs = available_backgrounds or []

    # ── Step 1: Director ──────────────────────
    result.logs.append(AgentLog("director", "running", "Analyzing prompt and creating scene plan..."))
    try:
        plan = await director_agent.create_plan(prompt, chars, bgs)
        result.plan_summary = plan.description or plan.title
        result.logs.append(AgentLog(
            "director", "completed",
            f"Scene plan created: '{plan.title}' — {len(plan.characters)} characters"
        ))
    except Exception as e:
        logger.error(f"[Orchestrator] Director failed: {e}", exc_info=True)
        result.logs.append(AgentLog("director", "error", f"Director failed: {str(e)}"))
        return result

    # ── Step 2: Builder ──────────────────────
    result.logs.append(AgentLog("builder", "running", "Building workflow nodes and edges..."))
    try:
        workflow = builder_agent.build_workflow(plan, available_characters=chars)
        result.workflow = workflow
        result.logs.append(AgentLog(
            "builder", "completed",
            f"Created {len(workflow.nodes)} nodes, {len(workflow.edges)} edges"
        ))
    except Exception as e:
        logger.error(f"[Orchestrator] Builder failed: {e}", exc_info=True)
        result.logs.append(AgentLog("builder", "error", f"Builder failed: {str(e)}"))
        return result

    # ── Step 3: Review Loop ──────────────────
    max_rounds = config.max_review_rounds

    if not config.has_api_key:
        # No API key → skip review, auto-approve
        result.logs.append(AgentLog(
            "reviewer", "completed",
            "Skipped review (no API key configured). Workflow auto-approved."
        ))
        result.review = ReviewResult(approved=True, round=0, feedback="Auto-approved (no API key)", score=5)
        result.success = True
        return result

    for round_num in range(1, max_rounds + 1):
        result.total_rounds = round_num
        result.logs.append(AgentLog(
            "reviewer", "running",
            f"Review round {round_num}/{max_rounds}..."
        ))

        try:
            # Analyze current scene
            context = analyze_scene(workflow.nodes, workflow.edges)
            context_text = context.arrangement_description

            # Get screenshot if callback provided
            screenshot = None
            if screenshot_callback:
                try:
                    screenshot = await screenshot_callback(workflow)
                except Exception as e:
                    logger.warning(f"[Orchestrator] Screenshot callback failed: {e}")

            # Review
            review = await reviewer_agent.review_scene(
                scene_context_text=context_text,
                screenshot_base64=screenshot,
                original_prompt=prompt,
                nodes=workflow.nodes,
                review_round=round_num,
            )

            result.review = review

            if review.approved:
                result.logs.append(AgentLog(
                    "reviewer", "completed",
                    f"✅ Approved (round {round_num}, score: {review.score}/10): {review.feedback}"
                ))
                result.success = True
                return result

            # Apply corrections
            result.logs.append(AgentLog(
                "reviewer", "running",
                f"Round {round_num}: {len(review.corrections)} corrections. {review.feedback}"
            ))

            if review.corrections:
                corrections_dicts = [c.to_dict() for c in review.corrections]
                workflow = builder_agent.apply_corrections(workflow, corrections_dicts)
                result.workflow = workflow

        except Exception as e:
            logger.error(f"[Orchestrator] Review round {round_num} failed: {e}", exc_info=True)
            result.logs.append(AgentLog(
                "reviewer", "error",
                f"Review round {round_num} failed: {str(e)}"
            ))
            break

    # Max rounds reached
    if result.review and not result.review.approved:
        result.logs.append(AgentLog(
            "reviewer", "completed",
            f"Max review rounds ({max_rounds}) reached. Final score: {result.review.score}/10"
        ))

    result.success = True  # Still return the workflow even if not perfect
    return result
