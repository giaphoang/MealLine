"""Pipecat food-assistance voice agent for MealLine.

The package deliberately lives outside the MealLine application.  It talks to
the existing read/create API only; importing it never changes MealLine files or
starts a server.
"""

__all__ = ["matcher", "prompts", "tools"]
