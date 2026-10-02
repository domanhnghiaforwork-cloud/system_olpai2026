from typing import Dict, List, Optional, Type
from .base import BaseEvaluator
from .eval_1_cv_hico import Eval1CvHicoEvaluator

# Registry mapping eval_id to evaluator instance or class
_EVALUATORS: Dict[str, BaseEvaluator] = {}

def register_evaluator(evaluator: BaseEvaluator):
    """Register an evaluator instance in the global registry."""
    _EVALUATORS[evaluator.eval_id] = evaluator

def get_evaluator(eval_id: Optional[str]) -> Optional[BaseEvaluator]:
    """Retrieve an evaluator by its configuration identifier."""
    if not eval_id:
        return None
    return _EVALUATORS.get(eval_id)

def list_available_evaluators() -> List[dict]:
    """
    List all registered evaluator configurations with metadata
    for Admin selection in UI.
    """
    results = []
    for eval_id, ev in _EVALUATORS.items():
        results.append({
            "id": ev.eval_id,
            "name": ev.name,
            "description": ev.description,
            "metric": ev.metric_name,
        })
    return results

# Auto-register default evaluators
register_evaluator(Eval1CvHicoEvaluator())
